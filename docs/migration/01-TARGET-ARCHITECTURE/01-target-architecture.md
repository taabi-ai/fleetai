# 01 · Target architecture

## Topology

```
                       ┌───────────────────────────────┐
  Browser ──HTTPS──► │ apps/web  (Next.js, UI only)      │
                       └───────────────┬───────────────┘
                                       │ /api/*  (same origin, rewrites)
                       ┌───────────────▼───────────────┐
                       │ apps/gateway (Fastify BFF)        │  JWT verify · RBAC · rate-limit (Redis) · routing · SSE relay
                       └─┬───┬───┬───┬───┬───┬───┬───┬─┘
         gRPC/HTTP       │   │   │   │   │   │   │   │
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ identity │ dashboard │ fleet-metrics │ ai │ platform-config │ notification │ media │ training │ engineering │
  └─────────────────────────────────────────────────────────────────────────┘
      each service: own PostgreSQL database/schema · own Prisma schema & migrations · own pgmq job queues

  Shared infrastructure:
    Redpanda (Kafka API)  ─ domain events (`fleetai.*` topics) + telemetry ingestion (`telemetry.*`)
    Redis                 ─ cache, rate limits, JWT deny-list, SSE fan-out (Streams), distributed locks
    MinIO (S3 API)        ─ media objects, training videos, exports
    OpenTelemetry Collector → Grafana Tempo/Loki/Prometheus (or New Relic — already integrated in monolith)
```

## Principles

1. **Database per service.** Physical isolation preferred (one PG database per service on the same cluster is fine to start). No cross-database joins, no shared Prisma client.
2. **Sync for queries, async for facts.** Services call each other synchronously only for *queries they cannot cache* (e.g. gateway → identity token introspection is avoided by using signed JWTs). All *state changes other services care about* are published as events.
3. **Transactional outbox everywhere.** A service writes its row and an `outbox` row in one transaction; a relay publishes to Redpanda. Never publish directly from a request handler.
4. **Contracts are code.** REST contracts = OpenAPI (generated from Zod schemas in `packages/contracts`); events = versioned JSON-Schema in `packages/events`. Consumers are generated, never hand-typed.
5. **Idempotent consumers.** Every consumer keys on `eventId`; duplicate delivery is a no-op.
6. **Read-models over remote calls.** The dashboard service keeps a tiny replicated `user_summary` table (id, name, role) fed by `identity.user.updated` instead of calling identity on every render.
7. **The web app owns no data.** `apps/web` is the ported Next.js UI; all `app/api/**` routes are removed as their service goes live. Server Components call the gateway with the user's JWT.

## Technology choices (why)

| Layer | Choice | Rationale |
|---|---|---|
| Mono-repo | **pnpm workspaces + Turborepo** | Remote cache, task graph, `--filter` for affected builds; agents know it well |
| Service framework | **NestJS 11 (Fastify adapter)** | Opinionated DI/modules give agents a predictable structure; first-class OpenAPI, Kafka & gRPC transports, health module |
| Gateway/BFF | **Fastify** + `@fastify/http-proxy`, `@fastify/rate-limit`, `@fastify/jwt` | Thin, fast, no business logic |
| ORM | **Prisma** (one schema per service) | Team already knows it; migrations via `prisma migrate deploy` |
| Validation | **Zod** → OpenAPI via `zod-to-openapi` | Single source for runtime + types + docs |
| Events | **Redpanda** (Kafka-compatible, single binary, no ZooKeeper) | Kafka semantics with 1/10th the ops cost; see ADR-004 |
| Job queues | **pgmq** inside each service DB | Transactional enqueue, no extra infra; see ADR-004 |
| Cache/limits | **Redis 7** (or Valkey) | Rate limits, widget-data cache, JWT deny-list, SSE Streams |
| Objects | **MinIO** | S3 API — monolith already speaks S3 via `lib/storage.ts` |
| Auth | **Own identity service issuing RS256 JWTs (JWKS)** | Preserves current credentials + RBAC; other services verify offline with the public key. Optional later: put Keycloak/Zitadel in front for SSO |
| Observability | **OpenTelemetry SDK** in every service; exporters configurable (OTLP → Grafana stack or New Relic) | Monolith already has New Relic RUM integration |
| Deploy | **Helm umbrella chart** (`deploy/helm/fleetai`) + **KEDA** ScaledObjects for consumers | Sub-chart per service; scale workers on Kafka lag / pgmq depth |
| Frontend | Keep **Next.js 16** UI, `output: standalone` | Zero UI rewrite; only data fetching changes |

## Request flow examples

**Load a dashboard:** web → gateway `GET /dashboards/:id` → dashboard-service (returns layout + widget configs) → web renders widgets → each widget `POST /widgets/data` → gateway → fleet-metrics (Redis cache hit 80%+) → JSON.

**AI "edit widget":** web → gateway `POST /ai/widgets` → ai-service checks quota (own DB) → enqueues `ai_jobs` (pgmq) → returns `202 {jobId}` → ai-worker streams tokens to Redis Stream `ai:job:{id}` → gateway SSE `GET /ai/jobs/:id/stream` relays → on completion ai-service publishes `ai.widget.generated`; dashboard-service does not act on it (UI applies the patch), but audit consumes it.

**Telemetry:** device/TSP → `ingest-api` (thin Fastify, API-key auth) → Redpanda `telemetry.vehicle.position` (partition by vehicleCode) → fleet-metrics consumer batches 500 msgs → `COPY` into `vehicle_position` hypertable → hourly job rolls up `daily_stat` → publishes `fleet.alert.raised` when thresholds hit → notification-service e-mails.
