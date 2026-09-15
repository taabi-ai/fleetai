# 02 · Model → service map (34 legacy Prisma models + new tables)

Line numbers refer to `legacy/fleetai_dash/nextjs_space/prisma/schema.prisma` (524 lines) so an agent can copy the exact block.

| Legacy model | Lines | Service / DB | Cross-boundary FKs to remove | New/changed |
|---|---|---|---|---|
| User | L12 | identity / `fleetai_identity` | — | drop `aiPinHash`-style fields into `AiPin` table if present; add `tokenVersion int` |
| Account | L34 | identity | — | keep for future OAuth |
| Session | L52 | identity | — | replaced by `RefreshToken(id, userId, hash, expiresAt, revokedAt)` |
| VerificationToken | L60 | identity | — | |
| Role | L199 | identity | — | permissions[] unchanged; publish `identity.role.updated` |
| Dashboard | L68 | dashboard / `fleetai_dashboard` | `ownerId→User` | plain `ownerId`; add `user_summary(id,name,email,role)` read-model |
| Widget | L88 | dashboard | `lockedBy→User`, `mcpServerId→McpServer` | plain columns |
| LibraryWidget | L103 | dashboard | `userId→User` | plain |
| DashboardShare | L118 | dashboard | `userId→User` | plain |
| MenuItem | L185 | platform-config / `fleetai_config` | — | |
| Vehicle | L420 | fleet-metrics / `fleetai_metrics` | — | |
| Driver | L399 | fleet-metrics | — | |
| Route | L409 | fleet-metrics | — | |
| Trip | L445 | fleet-metrics | — | consider monthly partitioning when > 5 M rows |
| AdasEvent | L464 | fleet-metrics | — | |
| ChargingSession | L477 | fleet-metrics | — | |
| FleetAlert | L488 | fleet-metrics | — | publish `fleet.alert.raised` on insert |
| DailyStat | L502 | fleet-metrics | — | now produced by roll-up job, still serves trend widgets |
| *(new)* VehiclePosition | — | fleet-metrics | — | hypertable / partitioned, 90-day retention |
| *(new)* IngestKey | — | fleet-metrics | — | hashed API keys for ingest-api |
| LlmProvider | L158 | ai / `fleetai_ai` | — | |
| LlmUsage | L264 | ai | `userId→User` | plain |
| UserQuota | L284 | ai | `userId→User` | plain; created on `identity.user.created` |
| CreditRequest | L295 | ai | `userId→User` | plain |
| McpServer | L146 | ai | — | |
| *(new)* AiJob | — | ai | — | `id, userId, dashboardId?, mode, prompt, status, result jsonb, error, tokens, createdAt, finishedAt` |
| EnvVar | L318 | platform-config | — | secret values encrypted (pgcrypto) |
| PlatformSetting | L311 | platform-config | — | |
| IntegrationSetting | L210 | platform-config | — | |
| SmtpSetting | L172 | platform-config (owner) → read by notification via `config.changed` | — | |
| AuditLog | L238 | platform-config | `userId→User` | plain; append-only; monthly partitions |
| Notification | L132 | notification / `fleetai_notify` | `userId→User` | plain |
| *(new)* EmailOutbox | — | notification | — | pgmq-backed send queue + status |
| MediaAsset | L329 | media / `fleetai_media` | `uploadedBy→User` | plain |
| *(new)* UploadSession | — | media | — | multipart uploadId tracking |
| TrainingModule | L347 | training / `fleetai_training` | — | |
| TrainingLesson | L363 | training | `videoAssetId→MediaAsset` (if FK) | plain; consume `media.asset.deleted` |
| TrainingProgress | L382 | training | `userId→User` | plain |
| DoraEvent | L220 | engineering / `fleetai_eng` | — | |
| *(new)* CrmScorecard | — | engineering | — | replaces deterministic sample in `/api/sales/overview` |

## Row counts to migrate (live DB, 2026-09-07)

User 11 · Role 7 · Dashboard 21 · Widget 94 · LibraryWidget 1 · MenuItem 7 · Notification 21 · AuditLog 900 · LlmProvider 1 · LlmUsage 8 · UserQuota 1 · CreditRequest 7 · EnvVar 1 · MediaAsset 6 · TrainingModule 2 · TrainingLesson 6 · TrainingProgress 4 · Vehicle 180 · Driver 15 · Route 8 · Trip 500 · AdasEvent 172 · ChargingSession 40 · FleetAlert 16 · DailyStat 90. Everything else 0. Small enough that backfill scripts can run in seconds; the CDC machinery is for *future* production volumes and can be skipped if you cut over during a short maintenance window.
