# 03 · Data ownership & database migration strategy

## Target databases

One PostgreSQL cluster (managed RDS/Azure Flexible Server, or the compose/k8s Postgres), **one database per service**:

```
fleetai_identity   fleetai_dashboard   fleetai_metrics   fleetai_ai   fleetai_config
fleetai_notify     fleetai_media       fleetai_training  fleetai_eng
```

Each database: its own role/password, `pgmq` extension installed (self-hosted PG allows `CREATE EXTENSION pgmq`), and for `fleetai_metrics` also `timescaledb` (or native partitioning if Timescale is unavailable).

## Splitting the 34-table schema

Full table in `06-REFERENCE/02-model-to-service-map.md`. Rules used:

1. A table goes to the service that **writes** it.
2. Foreign keys across service boundaries are **removed** and replaced by plain id columns + eventual consistency via events. Example: `Widget.dashboardId` stays an FK (same service); `Dashboard.ownerId → User` becomes a plain `ownerId String` with a `user_summary` read-model for display names.
3. Tables that several services read but one writes (`Role`, `User`) are replicated as **read-models** (small, denormalised) in consumer services, populated by events and backfilled once from the monolith DB.
4. `AuditLog` moves to platform-config but is **written only by the audit consumer** — no service inserts audit rows directly.

## Cross-boundary references to break

| Current FK | Resolution |
|---|---|
| Dashboard.ownerId → User | plain column + `user_summary` read-model in dashboard DB |
| DashboardShare.userId → User | plain column; validate via identity API at share-time only |
| Widget.lockedBy → User | plain column |
| LibraryWidget.userId → User | plain column |
| Notification.userId → User | plain column |
| LlmUsage.userId / UserQuota.userId / CreditRequest.userId → User | plain columns; `identity.user.created` creates default quota |
| MediaAsset.uploadedBy → User | plain column |
| TrainingProgress.userId → User | plain column |
| AuditLog.userId → User | plain column (event carries actor snapshot) |
| Widget.mcpServerId → McpServer | plain column; AI service validates on generation |
| TrainingLesson.videoAssetId → MediaAsset | plain column; training consumes `media.asset.deleted` |

## Migration of existing data (one-time, per service, Phase 3+ per roadmap)

1. **Freeze-free copy:** each service ships `scripts/backfill-from-legacy.ts` that connects to the legacy DB (`LEGACY_DATABASE_URL`, read-only role) and upserts into the service DB in batches of 500, keyed by original ids (cuid strings are preserved — do **not** renumber).
2. **Dual-write window:** while the monolith still owns writes, the service consumes a `legacy.<table>.changed` CDC stream. Simplest implementation: **Debezium PostgreSQL connector → Redpanda**, one connector, table allow-list per phase. Alternative without Debezium: monolith `withAudit()` already sees every mutation — add an outbox publisher there.
3. **Cut-over:** gateway flips the route flag `ROUTE_<service>=service` (from `legacy`), monolith route returns 410, CDC connector for those tables is stopped, backfill script run once more with `--verify` (row counts + checksums).
4. **Drop:** after 2 release cycles with no reads (verify with `pg_stat_user_tables.seq_scan/idx_scan` deltas), drop the tables from the legacy DB.

## Migrations tooling

- Each service: `prisma migrate dev` in dev (own DB, safe), `prisma migrate deploy` in CI/CD via a Helm pre-install/pre-upgrade **Job** per service.
- Baseline: generate with `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql` (same technique used in the monolith on 2026-09-07).
- Rule: **additive only** in normal PRs (add column nullable / add table / add index CONCURRENTLY). Column drops and renames require an ADR + expand/contract in two releases.
- Seed: `services/fleet-metrics/prisma/seed.ts` reuses the monolith's deterministic `seed-fleet.ts` (mulberry32, seed 20260907, upsert-only). Other services seed only reference data (roles, default menu, super admin).

## Time-series design for `fleet-metrics`

```sql
CREATE TABLE vehicle_position (
  time        timestamptz NOT NULL,
  vehicle_code text        NOT NULL,
  lat double precision, lng double precision, speed_kph real, soc real, fuel_pct real,
  PRIMARY KEY (vehicle_code, time)
);
SELECT create_hypertable('vehicle_position','time', chunk_time_interval => interval '1 day');
SELECT add_retention_policy('vehicle_position', interval '90 days');
-- continuous aggregate feeding DailyStat-like read models
CREATE MATERIALIZED VIEW vehicle_daily WITH (timescaledb.continuous) AS
  SELECT time_bucket('1 day', time) AS day, vehicle_code,
         avg(speed_kph) avg_speed, avg(fuel_pct) avg_fuel, avg(soc) avg_soc, count(*) samples
  FROM vehicle_position GROUP BY 1,2;
```

Without TimescaleDB: native `PARTITION BY RANGE (time)` monthly partitions + a nightly `pg_cron`/pgmq job that rolls up into `DailyStat`. The existing 16-column `DailyStat` table stays the serving model for trend widgets so widget resolvers need no changes.
