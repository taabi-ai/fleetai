# Prompt 01 — Shared packages and local infrastructure

**Branch:** `feat/01-shared-packages-infra`  
**Depends on:** prompt 00 merged.  
**Phase:** 1

## Role

You build the shared libraries every service will import, plus the local docker-compose stack
(Postgres 17 + TimescaleDB + pgmq, Redpanda, Redis, MinIO, OTel LGTM). After this prompt, a service
author should be able to *only* write domain code.

## Read first

1. `AGENTS.md`
2. `docs/migration/01-TARGET-ARCHITECTURE/04-adr-messaging.md` — envelope format, topic naming, pgmq vs shim
3. `docs/migration/01-TARGET-ARCHITECTURE/05-infra-components.md` — dev vs prod components, ports
4. `docs/migration/01-TARGET-ARCHITECTURE/06-security-observability.md` — JWT/JWKS, internal header, audit, OTel
5. `docs/migration/02-MONOREPO/01-monorepo-layout.md` § packages
6. `docs/migration/05-TEMPLATES/docker-compose.dev.yml`, `05-TEMPLATES/postgres-init.sql`, `05-TEMPLATES/event-schema.example.json`
7. Legacy files to port behaviour from:
   * `legacy/fleetai_dash/nextjs_space/lib/env.ts` → `@fleetai/config` (getEnv/getEnvMany semantics incl. DB override table — in the new world the override table lives in `platform-config` service; the package must support a *provider* interface: env → remote override)
   * `legacy/fleetai_dash/nextjs_space/lib/audit.ts` → `@fleetai/audit` (entity/verb naming, idParam behaviour)
   * `legacy/fleetai_dash/nextjs_space/lib/rbac.ts` → `@fleetai/auth` (permission catalog constants, `roleHas` semantics)
   * `legacy/fleetai_dash/nextjs_space/PGMQ_PLAN.md` → `@fleetai/queue` Track A shim (SKIP LOCKED) + Track B pgmq
   * `legacy/fleetai_dash/nextjs_space/lib/storage.ts` → `@fleetai/storage` key layout `<prefix>[public/]uploads/<folder>/<ts>-<name>`

## Deliverables

### Packages (each: `src/`, Vitest tests, README, exported types)

| Package | Must provide |
|---------|--------------|
| `@fleetai/config` | `getEnv(name, {required, default})`, `getEnvMany`, `ConfigProvider` interface with `EnvProvider` + `RemoteOverrideProvider(url, cacheTtl)`; Zod-validated `defineConfig(schema)` per service; forbids reading unknown keys. |
| `@fleetai/contracts` | Zod schemas for every HTTP DTO in `06-REFERENCE/01-route-to-service-map.md` grouped by service (`identity/*.ts`, `dashboard/*.ts` …). Start with **shared** DTOs only: `ErrorResponse`, `Pagination`, `Principal`, `WidgetConfig` (frozen contract, see AGENTS.md rule 9). Service-specific DTOs are added by each service prompt. `zod-to-openapi` registry helper `buildOpenApi(serviceName, schemas)`. |
| `@fleetai/events` | `EventEnvelope<T>` Zod schema (`eventId, type, version, occurredAt, producer, key, traceparent, payload`), `defineEvent(type, version, payloadSchema)`, topic name helper, `ProcessedEventsStore` (Prisma-agnostic interface + SQL for `processed_events(event_id pk, consumer, processed_at)`), `IdempotentConsumer` wrapper. Register the first envelopes from `06-REFERENCE/03-event-catalog.md` for `audit.entry.recorded` and `fleet.trip.completed` as examples. |
| `@fleetai/outbox` | `outbox_events` table SQL, `publishInTx(tx, event)`, `OutboxRelay` (polls `SKIP LOCKED`, publishes via kafkajs, marks sent, exponential retry, dead-letter after N), Nest module `OutboxModule.forRoot()`. |
| `@fleetai/queue` | `Queue` interface (`send`, `read(vt)`, `archive`, `delete`, `purge`), `PgmqQueue` (uses pgmq SQL functions), `SkipLockedQueue` (shim table `queue_<name>`), `createQueue(pool, name)` that **feature-detects** `pgmq` extension and falls back to shim with a one-time warning log. Worker helper with concurrency + visibility timeout renewal. |
| `@fleetai/auth` | `PERMISSIONS` const (frozen list), `Role`/`Principal` types, `verifyJwt(jwks)` (RS256 via `jose`), Fastify plugin + Nest guard `@RequirePermission('x.y')`, internal-call header signer/verifier (`x-fleetai-internal` HMAC). |
| `@fleetai/audit` | `@Audited({entity, verb?, idParam?})` Nest interceptor → builds the same record shape as legacy `withAudit` and publishes `audit.entry.recorded` via outbox. Fastify hook variant for the gateway. |
| `@fleetai/observability` | `initTelemetry(serviceName)` (OTel SDK, OTLP exporter, auto-instrumentation for http/fastify/pg/kafkajs/ioredis), pino logger with `traceId` injection, `/metrics` Prometheus exporter, Nest `ObservabilityModule`. |
| `@fleetai/storage` | S3 client factory from config (endpoint/path-style/region), `buildKey(folder, name, {public, prefix})`, presigned PUT (single) + multipart helpers, public URL builder with per-segment encoding. |
| `@fleetai/nest-common` | `bootstrapService(AppModule, {port, name})` (Fastify adapter, Zod validation pipe, global error filter mapping to `ErrorResponse`, graceful shutdown, health module wiring), `PrismaHealthIndicator`, `KafkaHealthIndicator`, `RedisHealthIndicator`. |
| `@fleetai/testing` | Testcontainers helpers: `startPostgres({timescale, pgmq})`, `startRedpanda()`, `startRedis()`, `startMinio()`; `withTestDb(schemaPath)` running `prisma migrate deploy`; kafkajs test consumer `collectEvents(topic, n)`. |
| `@fleetai/widget-contracts` | Move the frozen widget config Zod schema + metric/dataSource enums here (import from legacy `lib/widget-meta.ts`, `lib/widget-colors.ts`, `lib/types.ts` and `lib/mock-data.ts` names — read them, copy the *names* exactly). |

### Infra

* `infra/docker-compose.dev.yml` (from template; adjust image tags to latest stable), `infra/postgres/init.sql` (creates 9 databases + `timescaledb` in `fleet_metrics` + `pgmq` in all), `infra/redpanda/topics.yaml` + `infra/redpanda/create-topics.sh`, `infra/minio/bootstrap.sh` (buckets `fleetai-public`, `fleetai-private`), `infra/otel/otel-collector.yaml`.
* Root scripts `infra:up`, `infra:down`, `infra:reset`, `infra:topics`.

## Steps

1. Build `@fleetai/config` and `@fleetai/observability` first (everything depends on them).
2. `@fleetai/events` + `@fleetai/outbox` + `@fleetai/queue` with Testcontainers tests (real Postgres + Redpanda). Prove: outbox relay delivers exactly once under a killed-and-restarted relay; queue shim honours visibility timeout; pgmq path works when extension present (use `ghcr.io/pgmq/pg17-pgmq` image variant or `timescale/timescaledb-ha:pg17` with pgmq installed via init).
3. `@fleetai/auth` with a test key pair generated in-test (`jose` `generateKeyPair`).
4. `@fleetai/audit`, `@fleetai/storage` (MinIO container test uploads a file and reads it back), `@fleetai/nest-common`, `@fleetai/testing`.
5. Upgrade `services/_template` to use `bootstrapService`, `ObservabilityModule`, `OutboxModule`, config schema. It must still start and pass health.
6. Bring up compose; confirm every container healthy; run topics script.

## Acceptance

```bash
pnpm infra:up && docker compose -f infra/docker-compose.dev.yml ps    # all healthy
pnpm infra:topics                                                      # topics created
psql postgresql://fleetai:fleetai@localhost:5432/fleet_metrics -c "select extname from pg_extension"  # timescaledb, pgmq
pnpm turbo run test --filter='./packages/*'                            # green incl. Testcontainers
pnpm --filter @fleetai/service-template start & sleep 4 && curl -sf localhost:4099/health/ready && curl -sf localhost:4099/metrics | head -3
```

## Do not

* Do not implement any business service here.
* Do not use Redis as a message bus. Do not add RabbitMQ/NATS/BullMQ.
* Do not copy legacy code verbatim where it depends on Next.js (`NextRequest`, `auth()` from next-auth) — re-implement on Fastify/Nest primitives.

## Suggested split

* Session A: config, observability, nest-common, testing, compose/infra.
* Session B: events, outbox, queue (+ Testcontainers tests).
* Session C: auth, audit, storage, widget-contracts, template upgrade.

## Completion report

```
## Prompt 01 report
Packages built: <list with one-line API summary each>
Infra: compose services + ports, init.sql extensions confirmed
Testcontainers tests: <count>, runtime <s>
Acceptance output: <paste>
Deviations / open questions: <...>
```
