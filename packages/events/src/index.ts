/**
 * @fleetai/events — Event envelope, typed producers/consumers, idempotency.
 *
 * Cross-service events flow through Redpanda (Kafka API). Every envelope is
 * versioned; consumers dedupe on `eventId` via the `processed_events` table.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export const EventEnvelopeSchema = z.object({
  eventId: z.string().uuid().describe('Unique event id (dedupe key)'),
  type: z.string().describe('Event type, e.g. identity.user.created'),
  version: z.number().int().positive().describe('Schema version'),
  occurredAt: z.string().datetime({ offset: true }).describe('ISO-8601 UTC timestamp'),
  producer: z.string().describe('Producing service name'),
  key: z.string().optional().describe('Partition key'),
  traceparent: z.string().optional().describe('W3C traceparent for correlation'),
  payload: z.unknown(),
});
export type EventEnvelope<T = unknown> = z.infer<typeof EventEnvelopeSchema> & { payload: T };

export interface EventDefinition<T> {
  type: string;
  version: number;
  payloadSchema: z.ZodType<T>;
  topic: string;
}

export function defineEvent<T>(
  type: string,
  version: number,
  payloadSchema: z.ZodType<T>,
  topic?: string
): EventDefinition<T> {
  return { type, version, payloadSchema, topic: topic ?? topicFor(type) };
}

/** Map an event type to a Kafka topic: `identity.user.created` -> `identity.user.created`. */
export function topicFor(type: string): string {
  return type;
}

export function createEnvelope<T>(def: EventDefinition<T>, payload: T, opts: { producer: string; key?: string; traceparent?: string; eventId?: string }): EventEnvelope<T> {
  return {
    eventId: opts.eventId ?? crypto.randomUUID(),
    type: def.type,
    version: def.version,
    occurredAt: new Date().toISOString(),
    producer: opts.producer,
    key: opts.key,
    traceparent: opts.traceparent,
    payload,
  };
}

export function parseEnvelope<T>(def: EventDefinition<T>, raw: unknown): EventEnvelope<T> {
  const parsed = EventEnvelopeSchema.parse(raw);
  if (parsed.type !== def.type) {
    throw new Error(`Event type mismatch: expected ${def.type}, got ${parsed.type}`);
  }
  if (parsed.version !== def.version) {
    throw new Error(`Event version mismatch: expected ${def.version}, got ${parsed.version}`);
  }
  const payload = def.payloadSchema.parse(parsed.payload);
  return { ...parsed, payload };
}

// ---------------------------------------------------------------------------
// Registered event catalog (subset — full catalog in docs/migration/06-REFERENCE/03-event-catalog.md)
// ---------------------------------------------------------------------------

export const AuditEntryRecorded = defineEvent(
  'audit.entry.recorded',
  1,
  z.object({
    entity: z.string(),
    entityId: z.string().optional(),
    verb: z.string(),
    actorUserId: z.string().optional(),
    actorRole: z.string().optional(),
    ip: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    occurredAt: z.string().datetime({ offset: true }),
  })
);

export const FleetTripCompleted = defineEvent(
  'fleet.trip.completed',
  1,
  z.object({
    tripId: z.string(),
    vehicleId: z.string(),
    driverId: z.string().optional(),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    distanceKm: z.number().nonnegative(),
    fuelUsedL: z.number().nonnegative().optional(),
  })
);

// ---------------------------------------------------------------------------
// Idempotency store
// ---------------------------------------------------------------------------

export const PROCESSED_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS processed_events (
  event_id   uuid PRIMARY KEY,
  consumer   text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, consumer)
);
`;

export interface ProcessedEventsStore {
  /** Returns true if this (eventId, consumer) was already processed. */
  alreadyProcessed(eventId: string, consumer: string): Promise<boolean>;
  /** Records a processed event. */
  markProcessed(eventId: string, consumer: string): Promise<void>;
}

/**
 * Wraps a handler so it is idempotent: dedupe on eventId, then run, then mark.
 * On duplicate delivery the handler is skipped (no-op).
 */
export async function withIdempotency<T>(
  store: ProcessedEventsStore,
  consumer: string,
  envelope: EventEnvelope<T>,
  handler: (envelope: EventEnvelope<T>) => Promise<void>
): Promise<{ handled: boolean; skipped: boolean }> {
  if (await store.alreadyProcessed(envelope.eventId, consumer)) {
    return { handled: false, skipped: true };
  }
  await handler(envelope);
  await store.markProcessed(envelope.eventId, consumer);
  return { handled: true, skipped: false };
}
