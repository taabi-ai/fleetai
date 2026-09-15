# 01 · Mono-repo layout

```
fleetai-platform/
├─ AGENTS.md  CLAUDE.md  .clinerules          # agent instructions (copied from 04-AGENT-PROMPTS)
├─ package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json  .npmrc  .nvmrc (22)
├─ apps/
│  ├─ web/                 Next.js 16 UI (ported from legacy nextjs_space minus app/api)
│  ├─ gateway/             Fastify BFF: JWT, RBAC, rate-limit, proxy, SSE relay, route flags
│  └─ ingest-api/          Fastify edge for telemetry → Redpanda
├─ services/
│  ├─ identity/
│  ├─ dashboard/
│  ├─ fleet-metrics/       api + consumer + rollup worker (same code, different entrypoints)
│  ├─ ai/                  api + worker
│  ├─ platform-config/     api + audit consumer
│  ├─ notification/        api + worker
│  ├─ media/
│  ├─ training/
│  └─ engineering/
├─ packages/
│  ├─ contracts/           Zod schemas + OpenAPI per service; generated typed clients (`@fleetai/contracts`)
│  ├─ events/              event envelope, JSON-Schemas, typed producer/consumer, idempotency store (`@fleetai/events`)
│  ├─ outbox/              Prisma extension + relay worker (`@fleetai/outbox`)
│  ├─ queue/               pgmq client with SKIP-LOCKED shim fallback (`@fleetai/queue`)
│  ├─ auth/                JWT verify (jose/JWKS), permission catalog, Nest guards, Fastify plugin (`@fleetai/auth`)
│  ├─ audit/               `@Audited()` decorator → outbox (`@fleetai/audit`)
│  ├─ config/              env loading (zod), platform-config client with Redis cache (`@fleetai/config`)
│  ├─ observability/       OTel bootstrap, pino logger, Prometheus metrics (`@fleetai/observability`)
│  ├─ widget-contracts/    widget type catalog, color palettes, WidgetConfig schema (from legacy widget-meta.ts/widget-colors.ts)
│  ├─ ui/                  shadcn components shared by web (and future admin app)
│  ├─ nest-common/         base module: health, config, prisma provider, filters, interceptors
│  └─ testing/             Testcontainers helpers, fixtures, deterministic PRNG (mulberry32), API test client
├─ infra/
│  ├─ docker-compose.dev.yml   postgres(+timescale,pgmq) redpanda console redis minio otel-lgtm debezium(profile)
│  ├─ postgres/init.sql        create 9 databases + roles + extensions
│  ├─ redpanda/topics.yaml     topic list (partitions, retention) applied by `pnpm infra:topics`
│  └─ debezium/*.json          CDC connector configs (migration phases only)
├─ deploy/
│  ├─ helm/fleetai/            umbrella chart; charts/<service> sub-charts; values-{dev,staging,prod}.yaml
│  ├─ keda/                    ScaledObjects
│  └─ observability/           Grafana dashboards JSON, alert rules
├─ legacy/
│  └─ fleetai_dash/            read-only copy of the monolith (or git submodule) — reference for porting
├─ tests/
│  ├─ e2e/                     Playwright against docker-compose stack (ported from legacy tests/e2e)
│  └─ contract/                Pact-style consumer/provider tests between gateway and services
├─ docs/
│  ├─ migration/               THIS PACK
│  ├─ adr/                     ADR-001.. (template in 05-TEMPLATES)
│  └─ runbooks/
└─ .github/workflows/         ci.yml (affected-only), release.yml (images per service), deploy.yml (helm)
```

## Workspace conventions

- Package names: `@fleetai/<name>`; services are private packages `@fleetai/svc-<name>`; apps `@fleetai/app-<name>`.
- Every package: `src/`, `test/`, `package.json` with `build`, `dev`, `test`, `lint`, `typecheck` scripts; `tsconfig.json` extends `tsconfig.base.json` (`strict`, `NodeNext`, `ES2022`).
- Every service: identical skeleton from `05-TEMPLATES/service-skeleton.md`.
- One `Dockerfile` per app/service, all built by `turbo run docker#build --filter=...[origin/main]` (affected only).
- Prisma: `services/<svc>/prisma/schema.prisma`, client output `services/<svc>/node_modules/.prisma/client` (default). **Never** share a generated client between services.

## turbo.json (pipeline essentials)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json", ".env.example"],
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**", "!.next/cache/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      {},
    "test":      { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:int":  { "dependsOn": ["build"], "cache": false },
    "prisma:generate": { "cache": false },
    "dev":       { "cache": false, "persistent": true }
  }
}
```

## Tooling versions (pin in `package.json` `engines` + `.nvmrc`)

Node 22 LTS · pnpm 9 · Turborepo 2 · TypeScript 5.6+ · NestJS 11 · Fastify 5 · Prisma 6 · Next.js 16 · Vitest 2 · Playwright 1.4x · kafkajs 2 · ioredis 5 · jose 5 · zod 3.
