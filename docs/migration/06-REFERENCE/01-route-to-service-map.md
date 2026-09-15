# 01 · Route → service map (all 61 legacy route files / 78 handlers)

Legacy path is under `nextjs_space/app/api/`. Gateway exposes the **same paths** under `/api/*` so the web app and the 122 legacy API tests keep working; the "Service path" column is the internal path on the owning service. `Flag` is the gateway `ROUTE_*` variable that controls ownership.

| Legacy route | Methods | Service | Service path | Flag | Notes |
|---|---|---|---|---|---|
| `/api/auth/[...nextauth]` | Auth.js | identity | `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/session` | `ROUTE_identity` | Replace Auth.js; keep credentials flow |
| `/api/auth/login` | POST | identity | `/auth/login` | identity | |
| `/api/signup` | POST | identity | `/users/signup` | identity | publishes `identity.user.created` |
| `/api/admin/users` | GET,POST | identity | `/users` | identity | `admin.users` perms |
| `/api/admin/users/[id]` | PATCH,DELETE | identity | `/users/:id` | identity | password reset here |
| `/api/admin/roles` | GET,POST | identity | `/roles` | identity | fixed order user→…→super_admin then custom |
| `/api/admin/roles/[name]` | PATCH,DELETE | identity | `/roles/:name` | identity | publishes `identity.role.updated` → gateway deny-list bump |
| `/api/user/ai-pin` | GET,POST,DELETE | identity | `/me/ai-pin` | identity | AI PIN hash lives with user |
| `/api/user/ai-pin/verify` | POST,DELETE | identity | `/me/ai-pin/verify` | identity | returns short-lived `aiPinToken` claim used by ai service |
| `/api/dashboard` | GET,POST | dashboard | `/dashboards` | `ROUTE_dashboard` | |
| `/api/dashboard/[id]` | GET,PATCH,DELETE | dashboard | `/dashboards/:id` | dashboard | |
| `/api/dashboard/[id]/share` | GET,POST,DELETE | dashboard | `/dashboards/:id/shares` | dashboard | publishes `dashboard.shared` |
| `/api/dashboard/[id]/widgets` | POST,PUT | dashboard | `/dashboards/:id/widgets` | dashboard | PUT = bulk layout save |
| `/api/dashboard/[id]/widgets/[widgetId]` | PATCH,DELETE | dashboard | `/dashboards/:id/widgets/:wid` | dashboard | config incl. colorScheme/colors/pageSize |
| `/api/dashboard/[id]/widgets/[widgetId]/lock` | POST,DELETE | dashboard | `…/lock` | dashboard | |
| `/api/dashboard/presets` | POST | dashboard | `/dashboards/presets` | dashboard | |
| `/api/library` | GET,POST | dashboard | `/library` | dashboard | |
| `/api/library/[id]` | DELETE | dashboard | `/library/:id` | dashboard | |
| `/api/library/[id]/use` | POST | dashboard | `/library/:id/use` | dashboard | |
| `/api/marketplace` | GET | dashboard | `/marketplace` | dashboard | |
| `/api/marketplace/[id]/clone` | POST | dashboard | `/marketplace/:id/clone` | dashboard | |
| `/api/widgets/data` | POST | fleet-metrics | `/widgets/data` | `ROUTE_metrics` | Redis cache; weather passthrough |
| `/api/ai/generate-widget` | POST | ai | `/ai/widgets` → 202 `{jobId}`; `/ai/jobs/:id`, `/ai/jobs/:id/stream` | `ROUTE_ai` | gateway keeps a **compat shim**: sync-looking POST that waits up to 55 s on the stream so the legacy UI works until web is updated |
| `/api/admin/llm-providers` | GET,POST | ai | `/llm-providers` | ai | |
| `/api/admin/llm-providers/[id]` | PATCH,DELETE,POST | ai | `/llm-providers/:id` (+`/test`) | ai | |
| `/api/admin/mcp-servers` | GET,POST | ai | `/mcp-servers` | ai | categories general/crm/dtwin/analytics/devops |
| `/api/admin/mcp-servers/[id]` | PATCH,DELETE,POST | ai | `/mcp-servers/:id` (+`/test`) | ai | |
| `/api/mcp-servers` | GET | ai | `/mcp-servers?enabled=true` | ai | user-facing list |
| `/api/usage/me` | GET,POST | ai | `/usage/me` (+ POST credit request) | ai | |
| `/api/admin/usage` | GET,PUT | ai | `/admin/usage` | ai | |
| `/api/admin/usage/[userId]` | GET,PATCH,POST | ai | `/admin/usage/:userId` | ai | |
| `/api/admin/credit-requests` | GET,PATCH | ai | `/admin/credit-requests` | ai | |
| `/api/admin/env` | GET,PUT,DELETE | platform-config | `/admin/env` | `ROUTE_config` | publishes `config.changed` |
| `/api/admin/integrations` | GET | platform-config | `/admin/integrations` | config | |
| `/api/admin/integrations/[key]` | PUT,POST,DELETE | platform-config | `/admin/integrations/:key` (+`/test`) | config | secret fields blank = keep |
| `/api/admin/smtp` | GET,PUT,POST,DELETE | platform-config | `/admin/smtp` (+`/test` sends via notification) | config | |
| `/api/admin/menu` | GET,POST | platform-config | `/admin/menu` | config | |
| `/api/admin/menu/[id]` | PATCH,DELETE | platform-config | `/admin/menu/:id` | config | |
| `/api/menu` | GET | platform-config | `/menu` | config | filtered by JWT permissions (PERMISSION_PATHS) |
| `/api/admin/audit` | GET | platform-config | `/admin/audit` | config | |
| `/api/admin/system` | GET | platform-config | `/admin/system` | config | aggregates `/ready` of all services |
| `/api/admin/storage` | GET,POST | media | `/admin/storage` (+`/test`) | `ROUTE_media` | |
| `/api/notifications` | GET,PATCH,DELETE | notification | `/notifications` | `ROUTE_notify` | |
| `/api/media` | GET,POST | media | `/media` | media | POST = presign single |
| `/api/media/[id]` | GET,PATCH,DELETE | media | `/media/:id` | media | publishes `media.asset.deleted` |
| `/api/media/complete` | POST | media | `/media/complete` | media | |
| `/api/media/multipart/initiate` | POST | media | `/media/multipart/initiate` | media | |
| `/api/media/multipart/part` | POST | media | `/media/multipart/part` | media | |
| `/api/media/multipart/complete` | POST | media | `/media/multipart/complete` | media | |
| `/api/training` | GET | training | `/training` | `ROUTE_training` | `training.internal` filter |
| `/api/training/[slug]` | GET | training | `/training/:slug` | training | |
| `/api/training/progress` | POST | training | `/training/progress` | training | |
| `/api/admin/training` | GET,POST | training | `/admin/training` | training | |
| `/api/admin/training/[id]` | PATCH,DELETE | training | `/admin/training/:id` | training | |
| `/api/admin/training/[id]/lessons` | POST | training | `/admin/training/:id/lessons` | training | |
| `/api/admin/training/lessons/[lessonId]` | PATCH,DELETE | training | `/admin/training/lessons/:id` | training | |
| `/api/dora/events` | GET,POST | engineering | `/dora/events` | `ROUTE_eng` | POST auth = `x-dora-token` (from config `dora_webhook`), 503 if disabled |
| `/api/engineering/plane` | GET | engineering | `/engineering/plane` | eng | Plane.so proxy, cached |
| `/api/sales/overview` | GET | engineering | `/sales/overview` | eng | replace `sample:true` with CRM integration/MCP |
| `/api/health` | GET | gateway | `/health` | — | aggregate: gateway own + each service `/ready` (with 2 s timeout) |
