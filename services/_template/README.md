# @fleetai/service-template

Hello service that proves the monorepo toolchain. Copy this folder when creating a new service.

## Dev port

4099 (see `src/config.ts` — real services use 40xx from the service catalog).

## Run

```bash
pnpm --filter @fleetai/service-template dev        # tsx watch
pnpm --filter @fleetai/service-template build
pnpm --filter @fleetai/service-template start      # node dist/main.js
curl localhost:4099/health/live                    # 200
curl localhost:4099/health/ready                   # 200 (no deps yet)
```

## Structure

- `src/main.ts` — Fastify bootstrap, health endpoints, graceful shutdown.
- `src/config.ts` — Zod service config via `@fleetai/config`.
- `test/unit/health.spec.ts` — Vitest smoke test.

## When creating a new service

1. `cp -r services/_template services/<name>`
2. Update `package.json` name → `@fleetai/<name>`, port in `src/config.ts` → 40xx.
3. Add Prisma schema + migrations, domain modules, contracts in `packages/contracts/<name>/`.
4. Follow `docs/migration/05-TEMPLATES/service-skeleton.md`.
