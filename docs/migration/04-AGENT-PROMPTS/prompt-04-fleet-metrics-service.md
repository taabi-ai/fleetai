# Prompt 04 — `fleet-metrics` service + `ingest-api` (telemetry, KPIs, TimescaleDB)

**Branch:** `feat/04-fleet-metrics`  
**Depends on:** 00, 01 merged (10 recommended). Parallel-safe with 09.  
**Phase:** 3 — **this is the first real service extracted** because it is the biggest scalability
bottleneck and has the cleanest seam (`lib/mock-data.ts`).  
**Ports:** fleet-metrics 4003, ingest-api 4013 · **DB:** `fleet_metrics` (TimescaleDB) · **Packages:** `@fleetai/fleet-metrics`, `@fleetai/ingest-api`

## Role

You own everything about vehicles, drivers, routes, trips, ADAS events, charging sessions, fleet
alerts and daily statistics, and you expose the metric resolver the dashboard service calls. You
also build the ingestion path (HTTP → Redpanda → consumer → hypertables) that the monolith never had.

## Read first

1. `AGENTS.md`
2. `docs/migration/00-CONTEXT/02-scalability-assessment.md` (why this service is first)
3. `docs/migration/01-TARGET-ARCHITECTURE/02-service-catalog.md` § fleet-metrics, § ingest-api
4. `docs/migration/01-TARGET-ARCHITECTURE/03-data-ownership-and-migration.md` § TimescaleDB hypertables
5. `docs/migration/06-REFERENCE/02-model-to-service-map.md` — `Driver, Route, Vehicle, Trip, AdasEvent, ChargingSession, FleetAlert, DailyStat`
6. `docs/migration/06-REFERENCE/03-event-catalog.md` — `fleet.*`, `telemetry.*`
7. Legacy (read fully — these are the spec):
   * `legacy/fleetai_dash/nextjs_space/lib/mock-data.ts` — **every exported function is an endpoint/metric you must reproduce with identical return shape** (KPI cards, trend charts, pies with colour maps, tables). Note helpers `recentDaily(days)` (most-recent-N rows, not calendar-filtered) and `dailyDelta(field)`.
   * `legacy/fleetai_dash/nextjs_space/lib/weather-api.ts` — external weather source; keep as a metric source with Redis cache
   * `legacy/fleetai_dash/nextjs_space/lib/widget-meta.ts`, `lib/widget-colors.ts` — metric/dataSource catalog + colour maps
   * `legacy/fleetai_dash/nextjs_space/app/api/widgets/data/route.ts` — request/response contract of `resolveMetricData`
   * `legacy/fleetai_dash/nextjs_space/app/api/notifications/route.ts` — only the part that reads `FleetAlert`
   * `legacy/fleetai_dash/nextjs_space/scripts/seed-fleet.ts` — deterministic seed (mulberry32 seed 20260907, `inBatches`, upsert-only). Port faithfully.
   * `legacy/fleetai_dash/nextjs_space/prisma/schema.prisma` — the 8 fleet models (appended at the end of the file)

## Deliverables

### services/fleet-metrics
1. Prisma schema with the 8 models **plus** new `vehicle_position` (time, vehicleId, lat, lng, speed, heading, odometer, soc, fuelPct, source) and `telemetry_raw` tables created as TimescaleDB hypertables via raw SQL in the migration (`create_hypertable`, 7-day chunks, compression after 30 d, retention 400 d), plus continuous aggregates `vehicle_position_5m` and `daily_stat_rollup`. `DailyStat` remains a plain table (it is the API contract) but gains a nightly job that recomputes it from hypertables when telemetry exists (fallback: seeded values).
2. `POST /internal/metrics/resolve` (`{dataSource, metric, params}` → legacy response shape) implementing every case of legacy `resolveMetricData`; unit tests compare against fixture outputs captured from the legacy function over the seeded dataset (`tests/fixtures/metrics/*.json` — generate them with `scripts/capture-legacy-fixtures.ts` run against the legacy DB via `LEGACY_DATABASE_URL`).
3. Public REST (`/v1/vehicles`, `/v1/vehicles/:code`, `/v1/vehicles/:code/positions?from&to`, `/v1/drivers`, `/v1/routes`, `/v1/trips` (filters status/region/carrier/date, paginated), `/v1/adas-events`, `/v1/charging-sessions`, `/v1/alerts`, `/v1/alerts/:id/ack`, `/v1/daily-stats?days=`), all permission-guarded per the route map.
4. Consumers: `telemetry.position.received` (batch insert into hypertable, 500/batch, idempotent per `eventId`), `telemetry.trip.completed` → upsert `Trip` + publish `fleet.trip.completed`; `telemetry.adas.detected` → `AdasEvent` + `fleet.alert.raised` when severity ≥ high.
5. Producers (outbox): `fleet.trip.completed`, `fleet.alert.raised`, `fleet.alert.acknowledged`, `fleet.daily-stat.recomputed`, `audit.entry.recorded`.
6. Jobs (pgmq via `@fleetai/queue`): `recompute-daily-stats` (nightly + on demand), `alert-escalation`.
7. Redis cache for weather (TTL 10 min) and for expensive resolver results (TTL = min(refreshSec, 60 s)).
8. Seed: port `seed-fleet.ts` (same counts: 180 vehicles/150+30 EV, 15 drivers, 8 routes, 500 trips, ~172 ADAS, 40 charging, 16 alerts, 90 DailyStat).
9. Backfill script from legacy DB for the 8 tables + verification counts.

### apps/ingest-api
10. Fastify app: `POST /ingest/v1/positions` (array, max 1000), `POST /ingest/v1/trips`, `POST /ingest/v1/adas`, auth by per-device/per-tenant API key (`x-ingest-key`, keys stored in `fleet_metrics.ingest_keys`, cached in Redis), Zod validation, publishes to Redpanda topics `telemetry.position.received` etc. keyed by `vehicleId`, returns 202 with `accepted/rejected` counts. Backpressure: reject with 429 when producer queue > threshold. Rate limit per key.
11. k6 script `tests/load/ingest-positions.js` — target 5 000 positions/s sustained 2 min on a laptop compose stack; report p95 latency and consumer lag.

### Gateway flags
12. `/api/widgets/data` → `shadow` (dashboard service not yet extracted: gateway forwards legacy `/api/widgets/data` body to `fleet-metrics` `/internal/metrics/resolve` via the temporary adapter route described in prompt 10). `/api/notifications` alerts part → `shadow`.

## Steps

1. Capture legacy fixtures first (`scripts/capture-legacy-fixtures.ts`): for every `(dataSource, metric, params)` combination present in legacy `Widget` rows plus the full catalog from `widget-meta.ts`, run legacy `resolveMetricData` against `LEGACY_DATABASE_URL` and save JSON. This is your golden test suite.
2. Schema + hypertable migration SQL + seed. Verify seed determinism: run twice → identical row hashes.
3. Resolver module: port functions one by one; run golden tests; keep colour maps identical.
4. REST modules; consumers; producers; jobs.
5. `ingest-api`; k6.
6. Backfill + gateway flags.

## Acceptance

```bash
pnpm --filter @fleetai/fleet-metrics prisma migrate deploy && pnpm --filter @fleetai/fleet-metrics seed
psql $FLEET_METRICS_DATABASE_URL -c "select hypertable_name from timescaledb_information.hypertables"   # vehicle_position, telemetry_raw
pnpm --filter @fleetai/fleet-metrics test          # golden fixtures 100% pass
pnpm --filter @fleetai/fleet-metrics start & pnpm --filter @fleetai/ingest-api start & sleep 5
curl -sf localhost:4003/health/ready && curl -sf localhost:4013/health/ready
curl -s -XPOST localhost:4013/ingest/v1/positions -H "x-ingest-key: $INGEST_KEY" -H 'content-type: application/json' -d '[{"vehicleId":"V-0001","ts":"2026-09-07T10:00:00Z","lat":19.07,"lng":72.87,"speed":42}]'   # 202
sleep 3 && psql $FLEET_METRICS_DATABASE_URL -c "select count(*) from vehicle_position"   # >= 1
k6 run tests/load/ingest-positions.js --duration 30s --vus 50   # p95 < 200ms, 0 errors
```

## Do not

* Do not change any metric's return shape, key names, ordering or colour hex values.
* Do not use `Math.random()` anywhere — port mulberry32.
* Do not expose the internal resolver endpoint through the gateway without the internal header.
* Do not let `dashboard` or others query this DB.

## Suggested split

* Session A: fixtures capture + schema/hypertables + seed + resolver (golden tests).
* Session B: REST + consumers/producers + jobs + backfill.
* Session C: ingest-api + k6 + gateway flags.

## Completion report

```
## Prompt 04 report
Golden fixtures: <n> captured, <n> passing
Hypertables/aggregates created: <list>
Endpoints / events / consumers / jobs: <lists>
Seed determinism check: <hash equal yes/no>
k6 results: rps, p95, consumer lag
Acceptance output: <paste>
Deviations / open questions
```
