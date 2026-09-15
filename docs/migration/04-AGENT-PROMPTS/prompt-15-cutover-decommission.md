# Prompt 15 — Cutover to services and decommission the monolith

**Branch:** `chore/15-cutover-decommission` (one PR per service cutover is also acceptable)  
**Depends on:** every prior prompt merged; shadow mismatch rate < 0.1 % for 7 days per route group; 14 signed off by a human.  
**Phase:** 10

## Role

You execute the runbook that flips gateway flags from `shadow` to `service`, migrates the last
delta of data, verifies, and finally removes the monolith and the `legacy/` folder. This prompt
is deliberately conservative: **every step requires human confirmation before proceeding** — stop
and ask after each numbered step.

## Read first

1. `AGENTS.md`
2. `docs/migration/03-MIGRATION-PLAN/02-checklists-and-cutover.md` (the runbook — follow it literally)
3. `docs/migration/01-TARGET-ARCHITECTURE/03-data-ownership-and-migration.md` § backfill/CDC/cutover/drop
4. `apps/gateway/README.md` (flag flipping, shadow diff reading)
5. Grafana *Gateway shadow diffs* dashboard (prompt 12)

## Deliverables / steps (stop after each for confirmation)

1. **Freeze**: announce change freeze on the monolith; tag legacy repo snapshot; take full `pg_dump` of the legacy DB and a MinIO/S3 bucket inventory; store both off-cluster.
2. **Shadow report**: run `scripts/shadow-report.ts` (write it: queries Prometheus for `gateway_shadow_mismatch_total` per route over 7 d, prints table). Any route above 0.1 % is excluded from this cutover wave and listed in the report with sample diffs.
3. **Wave 1 — read-only, low risk**: flip to `service`: fleet-metrics reads (`/api/widgets/data`, notifications alerts), training reads, menu. Verify with `tests/api` subset + Grafana error rate for 30 min. Rollback = flip back (documented in runbook).
4. **Wave 2 — writes with data backfill delta**: for each of dashboard, media, training-admin, platform-config, engineering: (a) put legacy route group in maintenance (gateway returns 503 with `Retry-After: 120` for writes only), (b) run the service's `backfill-from-legacy.ts` in *delta* mode (rows updated since the last run), (c) run verification counts, (d) flip flag to `service`, (e) smoke test. Stop between services.
5. **Wave 3 — identity**: enable dual-issue period: web login goes to identity; existing legacy session cookies remain valid until expiry (gateway already accepts both). Flip `/api/auth/*`, `/api/signup`, users/roles/usage/credit-requests to `service`. After 30 days (or max legacy session TTL) remove `NEXTAUTH_SECRET` from gateway config.
6. **Wave 4 — AI**: flip `/api/ai/*`, PIN, providers, MCP. Confirm quota enforcement via identity is live (429 test with a test user at limit).
7. **Observation window**: 14 days on `service` with legacy still deployed but receiving zero gateway traffic (confirm via legacy access logs = 0 non-health requests).
8. **Decommission**: scale legacy Deployment to 0; after 7 more days delete it, its Ingress and Secrets; archive its database (`pg_dump` + `DROP DATABASE` only after a restore drill of the dump succeeds into a scratch instance); delete the `legacy/` folder from the monorepo in a dedicated PR; remove `legacy` flag support and `LEGACY_URL` from the gateway; remove the `shadow` mode? — **No**, keep shadow mode; it is useful for future service splits.
9. **Docs**: update `docs/migration/README.md` status table to "complete", move `06-REFERENCE/01-route-to-service-map.md` to "final state" (single column: service), write `docs/adr/00xx-monolith-decommissioned.md`, and record actual timelines and incidents in `docs/migration/03-MIGRATION-PLAN/04-retrospective.md`.

## Acceptance

```bash
pnpm tsx scripts/shadow-report.ts --days 7                 # all routes < 0.1% or excluded with reason
pnpm --filter @fleetai/gateway check:routes                # every route flag == service (legacy removed)
QA_BASE_URL=https://<prod-host> pnpm test:e2e              # all pass against services only
kubectl get deploy -n fleetai | grep -c legacy             # 0
```

## Do not

* Do not skip a confirmation stop.
* Do not drop the legacy database before a successful restore drill.
* Do not delete `legacy/` before step 8 conditions are met.
* Do not force-flip a route whose shadow mismatch rate is above threshold — fix the service first.

## Completion report

```
## Prompt 15 report
Waves executed with timestamps; routes flipped per wave
Shadow mismatch table (7 d)
Backfill delta counts per service
Incidents / rollbacks
Decommission checklist status
Acceptance output
```
