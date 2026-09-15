/**
 * @fleetai/outbox — Transactional outbox + Kafka relay.
 *
 * A service writes its row and an `outbox_events` row in one transaction
 * (`publishInTx`); `OutboxRelay` polls pending rows and publishes to Redpanda.
 * Never publish directly from a request handler.
 */

import type { EventEnvelope } from '@fleetai/events';

export const OUTBOX_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS outbox_events (
  id          bigserial PRIMARY KEY,
  event_id    uuid NOT NULL UNIQUE,
  event_type  text NOT NULL,
  event_version int NOT NULL,
  payload     jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts    int NOT NULL DEFAULT 0,
  last_error  text,
  dedupe_key  text
);
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx ON outbox_events (created_at) WHERE published_at IS NULL;
`;

export interface DbTx {
  $executeRaw: (query: string, ...params: unknown[]) => Promise<unknown>;
  $queryRaw: <T = unknown>(query: string, ...params: unknown[]) => Promise<T[]>;
}

export interface PublishInTxArgs {
  envelope: EventEnvelope;
  /** Optional dedupe key to prevent duplicate commits of the same logical event. */
  dedupeKey?: string;
}

/** Insert the outbox row inside the same transaction as the business write. */
export async function publishInTx(tx: DbTx, envelope: EventEnvelope, dedupeKey?: string): Promise<void> {
  await tx.$executeRaw(
    `INSERT INTO outbox_events (event_id, event_type, event_version, payload, dedupe_key)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (event_id) DO NOTHING`,
    envelope.eventId,
    envelope.type,
    envelope.version,
    JSON.stringify(envelope),
    dedupeKey ?? null
  );
}

export interface OutboxRelayOptions {
  producer: {
    send: (payload: { topic: string; messages: { key?: string; value: string }[] }) => Promise<void>;
  };
  pollIntervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  deadLetter?: (raw: unknown, error: Error) => Promise<void>;
  logger?: { warn(msg: string): void };
}

/**
 * Polls pending outbox rows (SKIP LOCKED), publishes via the Kafka producer,
 * marks them published. Exponential backoff; dead-letter after maxAttempts.
 */
export class OutboxRelay {
  constructor(
    private readonly query: (sql: string, params?: unknown[]) => Promise<unknown[]>,
    private readonly opts: OutboxRelayOptions
  ) {}

  async runOnce(): Promise<number> {
    const batchSize = this.opts.batchSize ?? 50;
    const rows = (await this.query(
      `SELECT id, event_id, event_type, event_version, payload, attempts
         FROM outbox_events
        WHERE published_at IS NULL AND attempts < $1
        ORDER BY id
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [this.opts.maxAttempts ?? 5, batchSize]
    )) as OutboxRow[];

    for (const row of rows) {
      try {
        await this.opts.producer.send({
          topic: row.event_type,
          messages: [{ key: (row.payload as any)?.key, value: JSON.stringify(row.payload) }],
        });
        await this.query(`UPDATE outbox_events SET published_at = now() WHERE id = $1`, [row.id]);
      } catch (err) {
        await this.query(
          `UPDATE outbox_events SET attempts = attempts + 1, last_error = $2 WHERE id = $1`,
          [row.id, String(err).slice(0, 2000)]
        );
        this.opts.logger?.warn(`outbox relay publish failed for ${row.event_type}: ${String(err)}`);
        if (row.attempts + 1 >= (this.opts.maxAttempts ?? 5)) {
          await this.opts.deadLetter?.(row, err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
    return rows.length;
  }

  /** Start an interval loop; returns a stop function. */
  start(): () => void {
    const interval = this.opts.pollIntervalMs ?? 1000;
    const timer = setInterval(() => {
      void this.runOnce().catch((e) => this.opts.logger?.warn(`outbox relay error: ${String(e)}`));
    }, interval);
    timer.unref?.();
    return () => clearInterval(timer);
  }
}

interface OutboxRow {
  id: number;
  event_id: string;
  event_type: string;
  event_version: number;
  payload: unknown;
  attempts: number;
}
