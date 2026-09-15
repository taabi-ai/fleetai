# AGENTS.md — FleetAI Platform monorepo

You are working in the **FleetAI Platform** monorepo: the microservices successor of the
`fleetai_dash` modular monolith (Taabi fleet-intelligence dashboard). This file is the contract
between humans and coding agents. Read it fully before touching code.

## 1. Where things are

| Path | Purpose |
|------|---------|
| `docs/migration/` | The migration documentation pack. **Source of truth for architecture decisions.** |
| `docs/migration/06-REFERENCE/` | Route→service, model→service, event catalog, env-var matrix. Consult before creating any endpoint, table or event. |
| `legacy/fleetai_dash/nextjs_space/` | Read-only snapshot of the monolith. Copy *logic*, never import from it. Never run it from here. |
| `apps/web` | Next.js 16 UI (ported from legacy `app/`, `components/`). |
| `apps/gateway` | Fastify API gateway (auth, routing, rate limits, route flags). |
| `apps/ingest-api` | High-throughput telemetry ingress → Redpanda. |
| `services/*` | NestJS 11 (Fastify adapter) microservices, one folder each, one database each. |
| `packages/*` | Shared libraries (`contracts`, `events`, `outbox`, `queue`, `auth`, `audit`, `config`, `observability`, `widget-contracts`, `ui`, `nest-common`, `testing`). |
| `infra/` | docker-compose for local dev, Postgres init SQL, Redpanda topics, OTel config. |
| `deploy/helm/` | Helm charts (umbrella + per-service), KEDA ScaledObjects. |
| `tests/` | Cross-service contract, e2e (Playwright) and load (k6) tests. |

## 2. Tech stack (fixed — do not substitute)

* Node 22 LTS, **pnpm 9** workspaces + **Turborepo**. TypeScript 5 `strict`. ESM.
* Services: **NestJS 11** on the **Fastify** adapter. Gateway: plain Fastify 5.
* DB: **PostgreSQL 17** (TimescaleDB extension for `fleet-metrics`), one database per service, **Prisma 6** per service (`services/<name>/prisma/schema.prisma`, migrations committed).
* Messaging: **Redpanda** (Kafka API) via `kafkajs` for cross-service events; **pgmq** (or the SKIP-LOCKED shim in `@fleetai/queue`) for in-service job queues; **Redis 7** for cache/rate-limit/sessions only — never as a message bus.
* Object storage: **MinIO** (S3 API) through `@aws-sdk/client-s3` — no vendor SDKs.
* Validation & contracts: **Zod** schemas in `packages/contracts` (HTTP) and `packages/events` (Kafka). Generated OpenAPI from Zod.
* Auth: RS256 JWT issued by `services/identity`, verified via JWKS in gateway and services (`@fleetai/auth`).
* Observability: OpenTelemetry (traces+metrics+logs) via `@fleetai/observability`; pino JSON logs.
* Tests: **TypeScript only** — Vitest (unit/integration), Testcontainers (Postgres/Redpanda), Playwright (e2e/api), k6 (load). **Never add Python tests or scripts.**
* Frontend: Next.js 16 (App Router), Tailwind, shadcn/ui, Recharts, SWR — same as legacy.

## 3. Non-negotiable rules

1. **Database per service.** A service may only touch its own database. Cross-service data → API call or consume an event and keep a local read-model. No cross-database joins, no shared Prisma client.
2. **Every state-changing write publishes through the outbox.** Use `@fleetai/outbox` (`publishInTx`) — never call the Kafka producer directly from a request handler.
3. **Every mutating endpoint is audited.** Apply `@Audited({ entity, verb })` from `@fleetai/audit`; it emits `audit.entry.recorded`. The legacy rule "even the smallest update is logged" still holds.
4. **Config via `@fleetai/config`** (`getEnv`), never raw `process.env` outside that package. New variables must be added to `docs/migration/06-REFERENCE/04-env-var-matrix.md` and to the service's `.env.example`.
5. **Contracts first.** Add/modify the Zod schema in `packages/contracts` or `packages/events` *before* implementing the handler/consumer. Breaking changes require a new versioned schema (`v2`), never in-place edits of a published one.
6. **Idempotent consumers.** Every Kafka consumer dedupes on `eventId` using the `processed_events` table pattern from `@fleetai/events`.
7. **Health endpoints**: every deployable exposes `GET /health/live` and `GET /health/ready` (ready checks DB + Kafka + Redis as applicable).
8. **Permission strings are frozen**: `ai.use`, `crm.view`, `crm.manage`, `dora.view`, `dora.manage`, `training.internal`, `training.manage`, `media.manage`, `admin.*` (see legacy `lib/rbac.ts`). Do not rename.
9. **Widget config contract is frozen** (`type,title,dataSource,metric,params{days,city},colorScheme,accentColor,colors[],pageSize,refreshSec,mcpServerId,mcpServerName,mcpServerLink`). The UI must keep rendering existing dashboards unchanged.
10. **No secrets in the repo.** `.env.example` with placeholders only. Never print secret values in logs or terminal output.
11. **No `Math.random()` demo data in services.** Seeds are deterministic (mulberry32, seed `20260907`, upsert-only) — port `legacy/.../scripts/seed-fleet.ts` faithfully.
12. **Do not edit `legacy/`.** Do not `import` from `legacy/`. Do not delete it until prompt 15.
13. **Do not introduce a new language, framework, ORM, message broker or package manager.** If you believe one is needed, stop and write an ADR (`05-TEMPLATES/adr-template.md`) instead.
14. **Smallest change that satisfies the prompt.** No drive-by refactors of packages you were not asked to touch.

## 4. Commands you will use

```bash
pnpm install                       # workspace install
pnpm turbo run build --filter=...  # build one workspace + deps
pnpm turbo run lint typecheck test # whole repo
pnpm --filter @fleetai/<svc> prisma migrate dev --name <slug>
pnpm --filter @fleetai/<svc> test
pnpm infra:up      # docker compose -f infra/docker-compose.dev.yml up -d
pnpm infra:down
pnpm dev           # turbo run dev (all apps/services with hot reload)
pnpm test:e2e      # playwright in tests/
```

Every prompt ends with the exact acceptance commands. Run them; paste real output in your report.

## 5. Definition of Done (applies to every task)

* `pnpm turbo run lint typecheck test` passes for affected workspaces.
* New endpoints: Zod contract + OpenAPI generated + integration test with Testcontainers.
* New events: schema in `packages/events`, entry in `docs/migration/06-REFERENCE/03-event-catalog.md`, consumer test proving idempotency.
* New tables: Prisma migration committed, `docs/migration/06-REFERENCE/02-model-to-service-map.md` updated.
* Service README (`05-TEMPLATES/service-README-template.md`) filled in.
* Helm values / compose updated when a new env var, port or dependency is introduced.
* Completion report (template inside each prompt) delivered.

## 6. When you are unsure

Search `docs/migration/` first. If the answer is genuinely absent, state your assumption
explicitly in the report and pick the option that keeps the legacy behaviour unchanged.
