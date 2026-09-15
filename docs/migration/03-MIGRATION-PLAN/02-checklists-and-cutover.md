# 02 · Per-service extraction checklist & cut-over runbook

## Extraction checklist (repeat for every service)

**Design**
- [ ] Tables owned confirmed against `06-REFERENCE/02-model-to-service-map.md`; no FK crosses boundary.
- [ ] Routes owned confirmed against `06-REFERENCE/01-route-to-service-map.md`; OpenAPI written in `packages/contracts/<svc>/`.
- [ ] Events published/consumed listed; JSON-Schemas added to `packages/events/schemas/<svc>/`.
- [ ] Permissions per endpoint copied verbatim from legacy `requirePermission()` calls (grep the legacy route file).

**Build**
- [ ] Service scaffolded from `05-TEMPLATES/service-skeleton.md`; `/health` `/ready` `/metrics`.
- [ ] Prisma schema = owned models copied from legacy `schema.prisma` with cross-boundary FKs replaced by plain columns; baseline migration generated.
- [ ] Business logic ported from the legacy `lib/*.ts` **with the same function names** first (facilitates diffing), refactor after tests pass.
- [ ] `@Audited()` on every mutation; outbox relay running; consumers idempotent.
- [ ] `scripts/backfill-from-legacy.ts` with `--verify` (counts + sha256 of sorted ids).
- [ ] Seed for reference data (deterministic).

**Verify**
- [ ] Unit + integration (Testcontainers) green.
- [ ] Legacy `tests/api` subset for these routes passes against gateway with `ROUTE_<svc>=service` in compose.
- [ ] `shadow` mode in staging for ≥ 3 days: `shadow_mismatch_total` = 0 (or every mismatch explained & accepted).
- [ ] Load test for the service's hottest route meets target.
- [ ] Dashboards + alerts exist for the service.

**Ship**
- [ ] Helm sub-chart + values for dev/staging/prod; migration Job hook.
- [ ] Runbook `docs/runbooks/<svc>.md` (restart, replay DLQ, rotate secrets, scale).
- [ ] Flag flipped to `service` in staging → prod; legacy route returns 410; CDC connector stopped; backfill `--verify` re-run.

## Production cut-over runbook (per flag flip)

1. Announce window; ensure on-call.
2. Snapshot legacy DB (managed snapshot) and service DB.
3. Stop Debezium connector for the tables (if used) **after** confirming lag = 0.
4. Run `backfill-from-legacy.ts --verify --since=<connector-stop-ts>` (catches the last seconds).
5. `kubectl set env deploy/gateway ROUTE_<svc>=service` (or Helm values PR + sync).
6. Watch for 15 min: gateway 5xx, service p95, `shadow_mismatch_total` (should stop incrementing), consumer lag, DLQ.
7. Rollback = set flag back to `legacy` (monolith still has the data up to step 3 + any writes since are in the service only → **rollback window is therefore short**; for write-heavy services enable reverse CDC service→legacy during the first week, or accept a brief read-only mode).
8. After 7 days stable: remove legacy route code in a PR; after 2 release cycles drop tables.

## Data verification queries

```sql
-- counts
SELECT 'Vehicle', count(*) FROM "Vehicle";   -- run on both sides
-- id checksum (stable regardless of insert order)
SELECT md5(string_agg(id, ',' ORDER BY id)) FROM "Dashboard";
-- metric parity: run the 25 widget metrics through legacy and new /widgets/data and diff JSON
```
