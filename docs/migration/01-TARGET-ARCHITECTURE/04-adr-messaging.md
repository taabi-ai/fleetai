# ADR-004 · Messaging: Redpanda (Kafka API) + pgmq — not one or the other

**Status:** Accepted for the target architecture · **Date:** 2026-09-07 · Supersedes the single-track assumption in the monolith's `PGMQ_PLAN.md`.

## Context

The monolith has zero async infrastructure. `PGMQ_PLAN.md` proposed pgmq for everything, which is correct for a *monolith* on a self-hosted PostgreSQL. A microservices split changes two things: (a) events must cross database boundaries, and pgmq queues are per-database; (b) real telemetry ingestion is a streaming workload with many consumers and replay needs.

## Decision matrix

| Workload | Volume | Consumers | Needs replay / retention | Needs transactional enqueue | → Tool |
|---|---|---|---|---|---|
| Vehicle telemetry (positions, CAN events) | 100s–10k msg/s | fleet-metrics, alerting, future ML/geo | yes (7–30 d) | no | **Redpanda** topic, partition by `vehicleCode` |
| Domain events between services (`identity.user.updated`, `fleet.alert.raised`, `audit.recorded`, `config.changed`) | 10s/s | 2–6 per event | yes (7 d) | yes → via **outbox** | **Redpanda** (published by outbox relay) |
| Service-internal jobs (LLM generation, e-mail send, roll-ups, backfills) | 1–100/s | 1 worker pool | no | **yes** (same tx as business row) | **pgmq** in that service's DB |
| Real-time UI push (AI token stream, live vehicle map) | bursty | 1 browser per stream | no | no | **Redis Streams / pub-sub** relayed by gateway SSE |
| Cache invalidation | low | all replicas | no | no | Redis pub/sub keyed off `config.changed` |

## Why Redpanda rather than Apache Kafka

Kafka-API compatible (same client libs: `kafkajs`, `@nestjs/microservices` Kafka transport), single Go/C++ binary, no ZooKeeper/KRaft cluster to run, built-in schema registry and HTTP proxy, trivial in docker-compose and Helm. If your cloud mandates a managed Kafka (MSK, Event Hubs Kafka endpoint, Confluent), nothing in the code changes.

## Why keep pgmq at all

The **dual-write problem**: a service that writes `AiJob` and then publishes to Kafka can crash between the two. pgmq's `send()` runs in the same transaction as the insert, so "job row exists ⇔ job queued" is guaranteed. The same property makes pgmq the ideal **outbox transport**: the outbox relay is just a pgmq consumer that forwards to Redpanda and archives.

## Why Redis is still needed

Neither Kafka nor pgmq is a cache or a low-latency fan-out for browsers. Redis provides: widget-data cache (TTL 15–60 s), rate-limit counters at the gateway, JWT deny-list (logout / role change before expiry), SSE fan-out via Streams so any gateway replica can serve any stream, distributed locks for singleton jobs (daily roll-up).

## Consequences

- Three infra components (Redpanda, Redis, PostgreSQL+pgmq) instead of one. All three are single-binary in dev (`05-TEMPLATES/docker-compose.dev.yml`) and Helm sub-charts in prod.
- Every service gets the same three libraries from `packages/`: `@fleetai/events` (typed producers/consumers, idempotency), `@fleetai/outbox` (Prisma middleware + relay), `@fleetai/queue` (pgmq wrapper with the shim fallback from `PGMQ_PLAN.md` Track A for PGs without the extension).
- Topic naming: `fleetai.<service>.<entity>.<verb>` for domain events, `telemetry.<entity>.<kind>` for ingestion, `<topic>.dlq` for dead letters. Keys: aggregate id. Schemas: JSON-Schema v1 in `packages/events/schemas/**`, `schemaVersion` in every envelope.
- Envelope: `{ eventId(uuidv7), type, schemaVersion, occurredAt, producer, traceId, actor?: {userId, role}, data }`.

## Rejected alternatives

- **RabbitMQ:** great work queue, weak replay/streaming; adds Erlang ops. Redundant with pgmq + Redpanda.
- **Only Kafka (also for jobs):** loses transactional enqueue; needs outbox anyway; overkill for 10 jobs/min e-mail sends.
- **Only pgmq:** cannot cross databases without polling every other service's DB — violates database-per-service.
- **NATS JetStream:** viable and lighter than Kafka; rejected only because Kafka-API skills/tooling (Debezium, Connect, managed offerings) are more common. Acceptable swap if the team prefers it — `@fleetai/events` is the only package that would change.
