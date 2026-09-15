# Prompt 03 — `dashboard` service (dashboards, widgets, layouts, sharing, menus)

**Branch:** `feat/03-dashboard-service`  
**Depends on:** 00, 01, 10 merged; 04 (`fleet-metrics`) merged because widget data resolution is delegated to it.  
**Phase:** 6  
**Port:** 4002 · **DB:** `dashboard` · **Package:** `@fleetai/dashboard`

## Role

You extract dashboard and widget persistence (the core of the product) into its own service. The
frozen widget config contract must survive byte-for-byte: existing dashboards exported from the
legacy DB must render identically after backfill.

## Read first

1. `AGENTS.md` (rule 9: frozen widget contract)
2. `docs/migration/01-TARGET-ARCHITECTURE/02-service-catalog.md` § dashboard
3. `docs/migration/06-REFERENCE/01-route-to-service-map.md` rows **dashboard**
4. `docs/migration/06-REFERENCE/02-model-to-service-map.md` — `Dashboard`, `Widget`, `DashboardShare`, `MenuItem`/menu config, `WidgetTemplate` (if present) and the FK-break note on `userId`
5. `docs/migration/06-REFERENCE/03-event-catalog.md` — `dashboard.*`
6. Legacy (read fully):
   * `legacy/fleetai_dash/nextjs_space/app/api/dashboard/**` (all route files: `dashboard`, `dashboard/[id]`, `[id]/share`, `[id]/widgets`, `[id]/widgets/[widgetId]`, `[id]/widgets/[widgetId]/lock`, `dashboard/presets`)
   * `legacy/fleetai_dash/nextjs_space/app/api/library/**` and `app/api/marketplace/**` (widget library + marketplace clone — these belong to the dashboard service too)
   * `legacy/fleetai_dash/nextjs_space/app/api/widgets/data/route.ts` — note it **awaits** `resolveMetricData`, which moves to `fleet-metrics`
   * `legacy/fleetai_dash/nextjs_space/app/api/menu/route.ts`, `app/api/admin/menu/**`, `lib/menu.ts` (`PERMISSION_PATHS`, `getMenuForRole`, DEFAULT_MENU auto-insert)
   * `legacy/fleetai_dash/nextjs_space/lib/widget-meta.ts`, `lib/widget-colors.ts`, `lib/types.ts` (widget type / dataSource / metric enums and colour maps)
   * `legacy/fleetai_dash/nextjs_space/app/dashboard/_components/dashboard-grid.tsx` — read only to learn the layout JSON shape (`x,y,w,h`) the UI persists
   * `legacy/fleetai_dash/nextjs_space/prisma/schema.prisma` (models above)

## Deliverables

1. `services/dashboard`: Prisma schema (`Dashboard`, `Widget`, `DashboardShare`, `MenuItem`, `processed_events`, `outbox_events`; store `ownerUserId` as plain string — no FK to identity), migrations, seed (default dashboards for the seeded users — mirror legacy seed).
2. Endpoints (`/v1/dashboards`, `/v1/dashboards/:id`, `/v1/dashboards/:id/share`, `/v1/dashboards/:id/widgets`, `/v1/dashboards/:id/widgets/:widgetId`, `.../lock`, `/v1/dashboards/presets`, `/v1/library`, `/v1/library/:id`, `/v1/library/:id/use`, `/v1/marketplace`, `/v1/marketplace/:id/clone`, `/v1/widgets/data`, `/v1/menu`, admin menu CRUD) matching the route map. Ownership/sharing checks reproduce legacy: owner or shared user can read; only owner (or `admin.*`) can mutate.
3. `POST /v1/widgets/data` (same request body as legacy `app/api/widgets/data/route.ts`) → validates widget config with `@fleetai/widget-contracts`, then calls `fleet-metrics` `POST /internal/metrics/resolve` (internal header) and returns the *same JSON shape* the legacy `/api/widgets/data` returned (the UI must not change). Cache in Redis for `refreshSec` seconds keyed by `widgetId+configHash`.
4. Weather widgets: legacy called an external weather API directly from `lib/mock-data.ts`; keep this in `fleet-metrics` (prompt 04), not here.
5. Events: `dashboard.created/updated/deleted`, `dashboard.widget.created/updated/deleted`, `dashboard.shared`, plus `audit.entry.recorded`. Consumer: `identity.user.deleted` → delete or orphan-mark dashboards (match legacy cascade behaviour — check `onDelete` in legacy schema).
6. Menu module: port `getMenuForRole` but permissions come from the JWT `perms[]` claim, not a DB lookup.
7. Contracts in `packages/contracts/dashboard/*`; OpenAPI.
8. Tests: integration for CRUD + sharing matrix + widget-data proxy (mock `fleet-metrics` with a Fastify stub in tests); **golden test**: load `tests/fixtures/legacy-dashboards.json` (export 3 real dashboards from legacy DB via the provided script) → backfill → `GET` → deep-equal.
9. Backfill script `scripts/backfill-from-legacy.ts` (Dashboard, Widget, DashboardShare, MenuItem) + verification.
10. Gateway flags for `/api/dashboards*`, `/api/widgets*`, `/api/menu*` → `shadow`.

## Steps

1. Copy `_template`; config: DB, Redis, Kafka, `FLEET_METRICS_URL`, internal HMAC secret.
2. Schema + migrations + seed.
3. Dashboards & widgets modules with ownership guard.
4. Widget data proxy + Redis cache.
5. Menu module.
6. Events + consumer.
7. Golden fixture export script (`scripts/export-legacy-fixtures.ts`, reads `LEGACY_DATABASE_URL`) and golden test.
8. Backfill + gateway flags.

## Acceptance

```bash
pnpm --filter @fleetai/dashboard prisma migrate deploy && pnpm --filter @fleetai/dashboard seed
pnpm --filter @fleetai/dashboard test
pnpm --filter @fleetai/dashboard start & sleep 4 && curl -sf localhost:4002/health/ready
# with a JWT from identity (or the test signer in @fleetai/testing):
curl -sf -H "authorization: Bearer $TOKEN" localhost:4002/v1/dashboards | jq 'length'
curl -sf -H "authorization: Bearer $TOKEN" localhost:4002/v1/widgets/$WIDGET_ID/data | jq 'keys'
```

## Do not

* Do not alter the widget config JSON shape or add required fields.
* Do not compute metrics here — delegate to `fleet-metrics`.
* Do not join to identity tables; use `ownerUserId` strings and the `identity.user.*` events.

## Completion report

```
## Prompt 03 report
Endpoints / events / consumers: <lists>
Golden test: <n> legacy dashboards deep-equal after backfill (yes/no + diff if any)
Cache behaviour: key format, TTL source
Acceptance output: <paste>
Deviations / open questions
```
