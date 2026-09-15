# @fleetai/web — Next.js 16 frontend (ported from legacy nextjs_space)

UI-only port of the FleetAI Dash monolith. **No database access** — every data
call goes to the gateway via `NEXT_PUBLIC_API_BASE_URL`.

## What was removed vs the legacy app

- `app/api/**` route handlers (the gateway or services own those paths now)
- `prisma/`, `scripts/`, `lib/db.ts`, `lib/mock-data.ts`
- Server-only libs: `audit, env, rbac, usage, storage, media, training, dora,
  integrations, llm, mcp, mailer, notify, admin, access, aws-config, weather-api, menu`

## What was added

- `lib/api-client.ts` — typed fetch wrapper against the gateway
- `auth.ts` — thin next-auth adapter: authorize goes to gateway `/api/auth/login`,
  tokens stored in the JWT session
- Session shape kept: `session.user.{id,email,name,role}` + `perms`

## Run

```bash
pnpm --filter @fleetai/web dev
# needs the gateway on :4000 (LEGACY_URL pointing at the monolith on :3001)
```

## Checks

```bash
pnpm --filter @fleetai/web typecheck
pnpm --filter @fleetai/web lint
pnpm --filter @fleetai/web build
```
