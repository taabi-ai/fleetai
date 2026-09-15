# @fleetai/<name>

> One sentence: what this service owns and why it exists.

| | |
|---|---|
| Port | 40xx |
| Database | `<name>` (PostgreSQL 17) |
| Owned tables | `A`, `B`, `C`, `outbox_events`, `processed_events` |
| Permissions used | `x.view`, `x.manage` |
| Legacy source | `legacy/fleetai_dash/nextjs_space/lib/<file>.ts`, `app/api/<...>` |
| Migration prompt | `docs/migration/04-AGENT-PROMPTS/prompt-NN-*.md` |

## API

OpenAPI: `GET /openapi.json` when running. Summary:

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | /v1/... | | |

Internal (HMAC header `x-fleetai-internal` required):

| Method | Path | Called by |
|--------|------|-----------|

## Events

**Produces:** `a.b.c` (v1), …  
**Consumes:** `x.y.z` (group `<name>.<purpose>`), …  
**Jobs (pgmq):** `queue-name` — what it does, schedule/trigger.

## Configuration

See `.env.example`. All variables are validated at boot by `src/config.ts`.

## Local development

```bash
pnpm infra:up
pnpm --filter @fleetai/<name> prisma migrate dev
pnpm --filter @fleetai/<name> seed
pnpm --filter @fleetai/<name> dev
curl localhost:40xx/health/ready
```

## Tests

```bash
pnpm --filter @fleetai/<name> test               # unit + integration (Testcontainers)
```

## Data migration from legacy

`pnpm --filter @fleetai/<name> backfill` — requires `LEGACY_DATABASE_URL`. Idempotent; prints
legacy vs new row counts per table. Supports `--since <iso>` for delta runs during cutover.

## Runbook

* Dashboards: Grafana → *Service detail* → `<name>`
* Alerts that page for this service and what to do: see `docs/runbooks/<name>.md`
* Known limits:
