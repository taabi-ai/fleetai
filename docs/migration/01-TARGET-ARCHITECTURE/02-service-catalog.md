# 02 · Service catalog

Each service: NestJS (Fastify), own PostgreSQL database `fleetai_<name>`, own Prisma schema at `services/<name>/prisma/schema.prisma`, `/health` + `/ready`, OpenTelemetry, outbox relay, pgmq for internal jobs. Ports are dev defaults.

| # | Service | Port | Owns (tables) | Sync API (via gateway prefix) | Publishes | Consumes | Extracted from monolith |
|---|---|---|---|---|---|---|---|
| 1 | **identity** | 4001 | User, Account, Session, VerificationToken, Role, AiPin (was User.aiPinHash) | `/auth/*` login/refresh/logout, `/users`, `/roles`, `/me`, `/.well-known/jwks.json` | `identity.user.created/updated/deleted`, `identity.role.updated`, `identity.login.succeeded/failed` | — | `auth.ts`, `lib/rbac.ts`, `lib/access.ts`, `/api/auth/*`, `/api/signup`, `/api/admin/users`, `/api/admin/roles`, `/api/user/ai-pin*` |
| 2 | **dashboard** | 4002 | Dashboard, Widget, DashboardShare, LibraryWidget, MarketplaceListing (from presets), user_summary (read-model) | `/dashboards/**`, `/library/**`, `/marketplace/**`, `/dashboards/presets` | `dashboard.created/updated/deleted`, `widget.created/updated/deleted/locked`, `dashboard.shared` | `identity.user.*` (read-model) | `/api/dashboard/**`, `/api/library/**`, `/api/marketplace/**` |
| 3 | **fleet-metrics** | 4003 | Vehicle, Driver, Route, Trip, AdasEvent, ChargingSession, FleetAlert, DailyStat, VehiclePosition (new, hypertable), IngestKey | `/widgets/data`, `/fleet/vehicles`, `/fleet/drivers`, `/fleet/alerts`, `/weather` | `fleet.alert.raised`, `fleet.dailystat.rolled_up`, `fleet.vehicle.updated` | `telemetry.vehicle.position`, `telemetry.vehicle.event`, `telemetry.charging.session` | `lib/mock-data.ts` (rename to `metrics/*.resolver.ts`), `lib/weather-api.ts`, `/api/widgets/data`, `scripts/seed-fleet.ts` |
| 3b | **ingest-api** (thin edge) | 4013 | — (validates & produces only) | `/ingest/v1/positions`, `/ingest/v1/events` (API-key auth) | `telemetry.*` | — | new |
| 4 | **ai** | 4004 | LlmProvider, LlmUsage, UserQuota, CreditRequest, McpServer, AiJob (new) | `/ai/widgets` (202+jobId), `/ai/jobs/:id`, `/ai/jobs/:id/stream` (SSE via gateway), `/llm-providers`, `/mcp-servers`, `/usage/me`, `/admin/usage`, `/admin/credit-requests` | `ai.job.completed/failed`, `ai.usage.recorded`, `ai.quota.exhausted` | `identity.user.created` (create default quota) | `lib/llm.ts`, `lib/llm-presets.ts`, `lib/mcp.ts`, `lib/usage.ts`, `/api/ai/generate-widget`, `/api/admin/llm-providers`, `/api/admin/mcp-servers`, `/api/mcp-servers`, `/api/admin/usage*`, `/api/usage/me`, `/api/admin/credit-requests` |
| 5 | **platform-config** | 4005 | EnvVar, PlatformSetting, IntegrationSetting, SmtpSetting, MenuItem, AuditLog | `/config/resolve` (internal), `/admin/env`, `/admin/integrations`, `/admin/smtp`, `/admin/menu`, `/menu`, `/admin/audit`, `/admin/system`, `/admin/storage` | `config.changed` (key, scope) | `audit.recorded` (from ALL services), `identity.login.*` | `lib/env.ts`, `lib/integrations.ts`, `lib/menu.ts`, `lib/audit.ts`, matching `/api/admin/*` |
| 6 | **notification** | 4006 | Notification, EmailOutbox, Template | `/notifications` (list/mark-read) | `notification.sent/failed` | `fleet.alert.raised`, `ai.job.completed`, `ai.quota.exhausted`, `dashboard.shared`, `identity.user.created`, `config.changed(smtp)` | `lib/notify.ts`, `lib/mailer.ts`, `/api/notifications` |
| 7 | **media** | 4007 | MediaAsset, UploadSession | `/media` (presign single/multipart, complete, list, delete) | `media.asset.created/deleted` | — | `lib/storage.ts`, `lib/media.ts`, `lib/aws-config.ts`, `/api/media/**`, `/api/admin/storage` |
| 8 | **training** | 4008 | TrainingModule, TrainingLesson, TrainingProgress | `/training/**`, `/admin/training/**` | `training.lesson.completed`, `training.module.published` | `media.asset.deleted` (unlink video) | `lib/training.ts`, `/api/training/**`, `/api/admin/training/**` |
| 9 | **engineering** | 4009 | DoraEvent, CrmScorecard (replaces sample), PlaneCache | `/dora/events` (webhook, `x-dora-token`), `/dora/metrics`, `/engineering/plane`, `/sales/overview` | `dora.event.received` | `config.changed(plane|dora_webhook|crm)` | `lib/dora.ts`, `/api/dora/events`, `/api/engineering/plane`, `/api/sales/overview` |
| G | **gateway** | 4000 | — | everything under `/api/*` for the web app | — | `identity.token.revoked` (deny-list to Redis) | replaces Next.js `app/api/**` |
| W | **web** | 3000 | — | UI only | — | — | `nextjs_space/app/**` minus `api/`, `components/`, `hooks/` |

## Service size sanity check

Nine services is the *end state*. It is acceptable — and recommended in the roadmap — to ship an intermediate state where `platform-config + notification + engineering` live in one deployable (`core`) and split later. The boundaries above are chosen so that splitting later needs no schema changes: they already own disjoint tables.

## Per-service non-functional requirements

| Requirement | Standard |
|---|---|
| Startup | < 5 s; readiness gate waits for DB + Kafka + Redis |
| Health | `GET /health` (liveness, no deps) and `GET /ready` (deps) — Terminus |
| Timeouts | Outbound HTTP 5 s, DB statement 5 s (matches managed PG), Kafka produce 10 s |
| Retries | Consumers: exponential back-off 1s→60s, 5 attempts, then DLQ topic `<topic>.dlq` |
| Idempotency | Consumers store `processed_event(event_id)`; HTTP POSTs accept `Idempotency-Key` |
| Logging | JSON (pino), fields `traceId, spanId, service, userId?, eventId?` |
| Metrics | RED (rate/errors/duration) per route + consumer lag + queue depth |
| Secrets | From env; never in code; dev via `docker-compose.dev.yml` `.env` |
| Tests | Vitest unit + `@nestjs/testing` integration with Testcontainers (PG, Redpanda, Redis) + contract tests against `packages/contracts` |
