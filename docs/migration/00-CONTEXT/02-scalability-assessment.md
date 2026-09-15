# 02 · Is the monolith scalable? — honest assessment

**Short answer:** it scales *horizontally for read-heavy dashboard traffic up to roughly the low thousands of concurrent users*, and it does **not** scale for real fleet telemetry ingestion, long-running AI jobs, or independent team velocity. The k8s manifests you saw are correct but they scale **one** container; that is not a microservices topology.

## What already works in its favour

| Property | Status | Why it matters |
|---|---|---|
| Stateless processes | ✅ JWT sessions, no in-memory state | Any number of replicas behind a load balancer works today (HPA 2→6 exists) |
| Health probe | ✅ `/api/health` checks DB latency | Rolling deploys & self-healing work |
| DB-backed everything | ✅ (since 2026-09-07) | No hidden mock state; scaling the DB scales the app |
| Additive migrations, idempotent seed | ✅ | Zero-downtime schema changes are possible |
| Test oracle | ✅ 161 automated tests | Safe refactoring baseline |

## Where it will break, in the order you will hit it

1. **Database connections.** Managed PG caps at 25 connections; each Next.js replica opens a Prisma pool. At ~6 replicas you exhaust connections. *Fix in monolith:* PgBouncer/transaction pooling. *Fix in target:* per-service pools, sized per service.
2. **Inline side effects.** An LLM call (5–60 s) or SMTP send holds an HTTP worker. Under load, dashboards slow down because AI requests hog the same process. *Fix:* queue + worker (pgmq/Kafka) — Phase 2 of the roadmap.
3. **Telemetry ingestion.** Real fleets emit GPS/CAN data every 1–10 s per vehicle. 5 000 vehicles ≈ 500–5 000 writes/s. Writing that through a Next.js route handler into the same DB that serves dashboards will saturate both. *Fix:* dedicated `fleet-metrics` ingestion service consuming a Kafka topic, writing to a time-series-optimised store (TimescaleDB hypertables or partitioned PG), serving pre-aggregated `DailyStat`-style read models.
4. **Widget data fan-out.** A dashboard with 12 widgets fires 12 `/api/widgets/data` POSTs per refresh (default `refreshSec`). 500 users × 12 widgets / 30 s ≈ 200 req/s of aggregate queries. *Fix:* Redis cache keyed by `(dataSource,metric,params)` with 15–60 s TTL, or server-pushed SSE from the metrics service.
5. **Deploy blast radius.** Changing the training module redeploys auth. Any bug anywhere restarts everything. *Fix:* service boundaries.
6. **Team velocity.** One Prisma schema and one `lib/` folder is one merge queue. *Fix:* mono-repo with owned packages.
7. **Long-running/streaming AI.** SSE from a Next.js route works but ties the stream to that replica; a rolling deploy kills streams. *Fix:* AI worker writes tokens to Redis Streams; gateway relays.

## Scaling ceilings (engineering estimates, not measurements)

| Dimension | Monolith today | With PgBouncer + Redis cache (cheap) | Target microservices |
|---|---|---|---|
| Concurrent dashboard users | ~1–2 k | ~5–10 k | tens of thousands (scale `dashboard` + `fleet-metrics` read replicas independently) |
| Telemetry writes/s | < 100 | < 500 | 10 k+ (Kafka partitions + batch inserts) |
| Parallel AI jobs | = HTTP workers | = HTTP workers | independent worker pool, KEDA-scaled on queue lag |
| Deploy frequency | whole app | whole app | per service |

## Recommendation

Do **not** rewrite big-bang. Follow the strangler-fig roadmap in `03-MIGRATION-PLAN/`: keep the monolith as the UI + fallback, extract services in the order of pain (fleet-metrics & ingestion first, AI second, identity third), route through a gateway, delete monolith routes as each service takes over traffic. Quick wins to apply to the monolith **today** while services are built: PgBouncer, Redis widget cache, move LLM calls behind pgmq.
