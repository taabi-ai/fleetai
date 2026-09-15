# 01 · Current architecture (as-is, verified 2026-09-07)

## Shape

FleetAI Dash is a **stateless modular monolith**: a single Next.js 16 (App Router, Turbopack) application in `nextjs_space/` that renders the UI with React Server Components and exposes **78 route handlers under `app/api/**`**. Business logic lives in `nextjs_space/lib/*.ts` modules; persistence is one PostgreSQL 17 database accessed through a single Prisma schema (`prisma/schema.prisma`, 34 models). There is no queue, no cache, no message broker and no background worker — every side effect (LLM call, SMTP send, DORA insert, audit write) runs inline inside the HTTP request.

```
Browser ──► Next.js (RSC + 78 API routes) ──► Prisma ──► PostgreSQL 17
                     │
                     ├──► LLM provider (RouteLLM / OpenAI-compatible)   inline
                     ├──► SMTP (nodemailer)                              inline
                     ├──► S3 / MinIO / Azure Blob (presigned URLs)       inline
                     ├──► Open-Meteo weather API                         inline
                     └──► Plane.so / New Relic / Jira (integrations)     inline
```

## Module inventory (`nextjs_space/lib/`)

| Module | Responsibility | Target service (see 01-TARGET) |
|---|---|---|
| `rbac.ts`, `access.ts`, `admin.ts` | Role table, permission catalog, `requirePermission()`, `roleHas()` | identity |
| `auth.ts` (root) | Auth.js v5 credentials provider, JWT sessions, login audit | identity |
| `menu.ts` | Role-filtered navigation, `PERMISSION_PATHS` | platform-config |
| `env.ts` | `getEnv()/getEnvMany()` — DB `EnvVar` overrides over `process.env` | platform-config |
| `integrations.ts` | New Relic / Plane / Jira / DORA webhook / CRM settings registry | platform-config |
| `audit.ts` | `withAudit(handler,{entity})` wraps every mutating route | audit (event consumer inside platform-config) |
| `llm.ts`, `llm-presets.ts`, `mcp.ts` | Provider abstraction, streaming, UsageSink, MCP server registry | ai |
| `usage.ts` | `LlmUsage`, `UserQuota`, `CreditRequest`, 429 on quota | ai |
| `mock-data.ts` (name is historical — now DB-backed) | ~35 async metric resolvers over Vehicle/Trip/AdasEvent/… | fleet-metrics |
| `weather-api.ts` | Open-Meteo proxy | fleet-metrics |
| `widget-meta.ts`, `widget-colors.ts` | Widget type catalog, palettes | shared package `@fleetai/widget-contracts` |
| `storage.ts`, `media.ts`, `aws-config.ts`, `upload-client.ts` | Presigned PUT/multipart, `MediaAsset` | media |
| `training.ts` | Modules/lessons/progress | training |
| `notify.ts`, `mailer.ts` | In-app `Notification` + SMTP | notification |
| `dora.ts` | DORA metric computation | engineering |
| `db.ts` | Prisma singleton | per-service `db.ts` |

## Data model inventory (34 models)

See `06-REFERENCE/02-model-to-service-map.md` for the full ownership table. Summary:

- **Identity (5):** User, Account, Session, VerificationToken, Role
- **Dashboards (5):** Dashboard, Widget, LibraryWidget, DashboardShare, MenuItem*
- **Fleet metrics (8):** Vehicle, Driver, Route, Trip, AdasEvent, ChargingSession, FleetAlert, DailyStat
- **AI (5):** LlmProvider, LlmUsage, UserQuota, CreditRequest, McpServer
- **Platform config (5):** EnvVar, PlatformSetting, IntegrationSetting, SmtpSetting, AuditLog
- **Notification (1):** Notification
- **Media (1):** MediaAsset
- **Training (3):** TrainingModule, TrainingLesson, TrainingProgress
- **Engineering (1):** DoraEvent

_*MenuItem is navigation config → platform-config._

## Cross-cutting behaviours that MUST survive the split

1. **Every mutation is audited** (`withAudit`). In the target, services publish `audit.recorded` events; the platform-config service persists them.
2. **Config is read through `getEnv()`**, never `process.env` directly — DB-stored overrides win. Target: platform-config service exposes `/config/resolve`, other services cache with Redis + invalidation event.
3. **RBAC permission strings** (`ai.use`, `crm.view`, `dora.manage`, `training.internal`, `media.manage`, `admin.*`, …) are enforced at the route. Target: JWT carries `permissions[]` claim; gateway + each service enforce.
4. **AI quota**: `generate-widget` returns 429 when `UserQuota` exhausted, records `LlmUsage` per call.
5. **Widget config contract** (`type,title,dataSource,metric,params{days,city},colorScheme,accentColor,colors[],pageSize,refreshSec,mcpServerId,markerStyle,animate,code`) is shared by the UI, the AI generator and the data API — it becomes a versioned shared package. `type` now includes `custom`: a widget whose `code` field holds self-contained HTML/CSS/JS that the AI writes on the fly and the UI runs in a **sandboxed `<iframe sandbox="allow-scripts">`** (opaque origin, no cookies/network) fed live metric data over `postMessage`. `markerStyle` (`dot|truck|vehicle`) and `animate` are map-only options. These three fields must be carried into the shared widget-contracts package and the AI service's generation prompt (see §AI-service and prompt-05).
6. **Seeded demo data** must remain deterministic (mulberry32 PRNG, seed 20260907) and idempotent (upsert-only).

## Existing deployment assets (reuse, do not discard)

- `nextjs_space/Dockerfile` — multi-stage node:22-bookworm-slim, non-root, `/api/health` probe.
- `docker-compose.yml` — app + postgres + one-shot `migrate` profile.
- `k8s/` — Namespace, Deployment (2 replicas, HPA 2→6 @70% CPU), Service, Ingress, migrate Job, Kustomization. **These deploy ONE container**; they are not microservices manifests.
- `.github/workflows/ci.yml`, `deploy-k8s.yml` — quality + tests jobs, kubectl rollout.
- `tests/` — 28 unit / 122 API / 11 e2e (Playwright). Reuse as the **regression oracle** during migration: the new gateway must pass the same API suite.
- `PGMQ_PLAN.md` — queue design already drafted (queues `ai_jobs`, `notifications`, `dora_ingest`, …). Reused in `01-TARGET-ARCHITECTURE/04-adr-messaging.md`.
