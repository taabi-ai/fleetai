# Prompt 06 — `platform-config` service (env overrides, integrations, SMTP, storage settings, system info, audit read API)

**Branch:** `feat/06-platform-config`  
**Depends on:** 00, 01, 10 merged; 09 merged (audit consumer owns the audit store this service exposes). Parallel-safe with 02, 03, 05.  
**Phase:** 7  
**Port:** 4005 · **DB:** `platform_config` · **Package:** `@fleetai/platform-config`

## Role

You extract the admin "settings" surface: runtime env-var overrides, the integrations registry
(New Relic, Plane, Jira, DORA webhook token, CRM), SMTP settings, storage settings, the system info
panel, and the read API for the audit log. You also implement the remote provider that
`@fleetai/config` uses so other services can pick up overrides without redeploying.

## Read first

1. `AGENTS.md`
2. `docs/migration/01-TARGET-ARCHITECTURE/02-service-catalog.md` § platform-config
3. `docs/migration/06-REFERENCE/01-route-to-service-map.md` rows **platform-config**
4. `docs/migration/06-REFERENCE/02-model-to-service-map.md` — `EnvVar`, `IntegrationSetting`, `SmtpSetting`/`StorageSetting` (check exact legacy names), `AuditLog` (owned by audit consumer in 09 — this service **reads** it via the audit read model, see note)
5. `docs/migration/06-REFERENCE/04-env-var-matrix.md`
6. Legacy:
   * `legacy/fleetai_dash/nextjs_space/lib/env.ts` (override precedence: DB → process.env), `lib/integrations.ts` (registry, secret fields blank = keep stored, test-connection functions), `lib/mailer.ts`, `lib/admin.ts`, `lib/aws-config.ts`, `lib/storage.ts` (settings part only)
   * `legacy/fleetai_dash/nextjs_space/app/api/admin/env/route.ts`, `app/api/admin/integrations/**`, `app/api/admin/smtp/route.ts`, `app/api/admin/storage/route.ts`, `app/api/admin/system/route.ts`, `app/api/admin/audit/route.ts`
   * `legacy/fleetai_dash/nextjs_space/components/new-relic-rum.tsx` — the UI reads New Relic config at render; expose `GET /v1/public-config` for that

## Deliverables

1. `services/platform-config`: Prisma schema (`EnvVar`, `IntegrationSetting` with encrypted secret columns, `SmtpSetting`, `StorageSetting`, `AuditEntry` **read model** populated by consuming `audit.entry.recorded` — decision: the audit *store* lives here (09 makes this service the consumer; if 09 was run first with a separate `audit` consumer, merge per 09's note)), migrations, seed.
2. Endpoints: admin env CRUD (`GET/PUT/DELETE /v1/admin/env`), integrations (`GET /v1/admin/integrations`, `GET/PUT /v1/admin/integrations/:key`, `POST /:key/test`), SMTP get/put/test, storage get/put/test, `GET /v1/admin/system` (versions, uptime, DB latency of *this* service plus aggregated health of all services fetched from their `/health/ready`), `GET /v1/admin/audit` (filters: entity, actor, verb, date; paginated), `GET /v1/public-config` (non-secret UI config: New Relic browser keys when enabled, feature flags), `GET /internal/config/overrides?service=` (internal header; returns the override map for `@fleetai/config` RemoteOverrideProvider), `GET /internal/integrations/:key` (internal; secrets included; used by notification/engineering services).
3. Events: `config.env.updated` (key only, never value), `config.integration.updated`, `audit.entry.recorded`. Consumer: `audit.entry.recorded` → `AuditEntry` (idempotent, retention job 400 d via pgmq).
4. Secret handling: AES-256-GCM with `CONFIG_SECRETS_KEY`; API never returns secret values (returns `"••••"` + `hasValue: true`), blank on PUT = keep (legacy semantics).
5. Tests: precedence tests for overrides, secret masking, integration test-connection with stubbed HTTP servers, audit filter tests.
6. Contracts, OpenAPI, README, `.env.example`, Helm stub, compose entry, backfill script (`EnvVar, IntegrationSetting, AuditLog` → new tables).
7. Gateway flags `/api/admin/env`, `/api/admin/integrations*`, `/api/admin/smtp`, `/api/admin/storage`, `/api/admin/system`, `/api/admin/audit` → `shadow`.

## Steps

1. Copy `_template`; config schema.
2. Schema/migrations/seed.
3. Env override module + internal overrides endpoint; wire `RemoteOverrideProvider` in `@fleetai/config` to it and prove a change is visible in `_template` within `CONFIG_REFRESH_SEC`.
4. Integrations/SMTP/storage modules with encryption + test-connection.
5. System info aggregation.
6. Audit consumer + read API + retention job.
7. Backfill + flags.

## Acceptance

```bash
pnpm --filter @fleetai/platform-config prisma migrate deploy && pnpm --filter @fleetai/platform-config seed
pnpm --filter @fleetai/platform-config test
pnpm --filter @fleetai/platform-config start & sleep 4 && curl -sf localhost:4005/health/ready
curl -sf -H "authorization: Bearer $ADMIN_TOKEN" localhost:4005/v1/admin/integrations | jq '.[].key'
curl -sf -H "authorization: Bearer $ADMIN_TOKEN" localhost:4005/v1/admin/audit?limit=5 | jq '.items | length'
curl -sf localhost:4005/v1/public-config | jq 'keys'
```

## Do not

* Do not return decrypted secrets to the UI. Internal endpoint only, internal header only.
* Do not publish env *values* in events.
* Do not let services read `platform_config` DB directly — they use `@fleetai/config` RemoteOverrideProvider.

## Completion report

```
## Prompt 06 report
Endpoints / events / consumers / jobs
Override propagation proof (service picked up change in <s>)
Secret masking evidence
Acceptance output
Deviations / open questions
```
