# Prompt 02 — `identity` service (users, roles, sessions, JWT/JWKS, quotas)

**Branch:** `feat/02-identity-service`  
**Depends on:** prompts 00, 01, 10 (gateway) merged. Parallel-safe with 03, 06.  
**Phase:** 5  
**Port:** 4001 · **DB:** `identity` · **Package:** `@fleetai/identity`

## Role

You extract authentication, users, roles/permissions, per-user LLM quotas and credit requests
from the monolith into a NestJS service that issues RS256 JWTs and publishes a JWKS. The Next.js
UI stops using next-auth credentials-provider against its own DB and instead calls this service
through the gateway.

## Read first

1. `AGENTS.md`
2. `docs/migration/01-TARGET-ARCHITECTURE/02-service-catalog.md` § identity
3. `docs/migration/01-TARGET-ARCHITECTURE/06-security-observability.md` § Identity & tokens
4. `docs/migration/06-REFERENCE/01-route-to-service-map.md` — rows marked **identity**
5. `docs/migration/06-REFERENCE/02-model-to-service-map.md` — `User`, `Account`, `Session`, `VerificationToken`, `Role`, `UserQuota`, `CreditRequest`, `LlmUsage`(ownership note)
6. `docs/migration/06-REFERENCE/03-event-catalog.md` — `identity.*` events
7. `docs/migration/03-MIGRATION-PLAN/02-checklists-and-cutover.md`
8. Legacy (read fully):
   * `legacy/fleetai_dash/nextjs_space/auth.ts` (credentials flow, audit of login/logout)
   * `legacy/fleetai_dash/nextjs_space/lib/rbac.ts` (default roles, permission catalog, `ensureDefaultRoles`, 30s cache)
   * `legacy/fleetai_dash/nextjs_space/lib/usage.ts` (quota logic, 429 semantics)
   * `legacy/fleetai_dash/nextjs_space/app/api/signup/route.ts`, `app/api/admin/users/**`, `app/api/admin/roles/**`, `app/api/admin/credit-requests/**`, `app/api/usage/me/route.ts`, `app/api/admin/usage/**`
   * `legacy/fleetai_dash/nextjs_space/prisma/schema.prisma` (models above — line numbers in the model map)
   * `legacy/fleetai_dash/nextjs_space/scripts/seed.ts` — how the test user and super admin are seeded (**do not copy password hashes or plaintext passwords into the repo**; seed reads `SEED_ADMIN_PASSWORD` from env)

## Deliverables

1. `services/identity` from `_template`: Prisma schema with the models above (drop next-auth `Account/Session/VerificationToken` only if the web port in prompt 11 no longer needs them — default: keep `Session` for refresh tokens, drop the other two), migrations, deterministic seed (`pnpm --filter @fleetai/identity seed`).
2. Endpoints (all under `/v1`, see route map for exact paths and permissions):
   * `POST /auth/login` (email+password, bcrypt, returns access JWT 15 min + refresh token 30 d, sets audit `auth.login`), `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
   * `GET /.well-known/jwks.json` (RS256 public keys, key rotation supported via `IDENTITY_JWT_KEYS` config: active + previous)
   * `POST /auth/signup` (same validation as legacy signup route; default role `user`)
   * Admin users CRUD, admin roles CRUD (matrix), `isValidRole` validation, permission catalog endpoint
   * Quotas: `GET /usage/me`, `GET /admin/usage`, `GET /admin/usage/:userId`, credit-requests CRUD, `POST /internal/quota/consume` (called by `ai` service; internal-header protected) returning remaining or 429 — must reproduce legacy `lib/usage.ts` rules
   * Password reset by admin only (`PATCH /admin/users/:id {password}`) — legacy has no self-service reset; do not invent one.
3. Events published via outbox: `identity.user.created`, `identity.user.updated`, `identity.user.deleted`, `identity.role.updated`, `identity.quota.exhausted`, `audit.entry.recorded` for every mutation.
4. Consumer: `ai.usage.recorded` → updates `LlmUsage` aggregate used by quota (idempotent).
5. JWT claims: `sub, email, role, perms[] (expanded), name, iat, exp, iss=fleetai-identity, aud=fleetai`. Gateway (prompt 10) already validates via JWKS — confirm claim names match `@fleetai/auth`.
6. Zod contracts in `packages/contracts/identity/*`, OpenAPI at `/openapi.json`.
7. Tests: unit (quota rules table-driven from legacy behaviour), integration (Testcontainers: login→refresh→me; role matrix; quota consume 429), contract test for JWKS.
8. Service README, `.env.example`, Helm values stub (`deploy/helm/charts/identity/values.yaml`), compose entry.
9. Data migration script `services/identity/scripts/backfill-from-legacy.ts` reading legacy DB (`LEGACY_DATABASE_URL`) tables `User, Role, UserQuota, CreditRequest, LlmUsage` → new DB, idempotent, with row-count verification (pattern in `03-MIGRATION-PLAN/02-checklists-and-cutover.md`).

## Steps

1. Copy `_template`, rename, define config schema (DB URL, JWT keys, bcrypt cost, token TTLs, Kafka, Redis for refresh-token revocation list).
2. Prisma schema + migration; seed.
3. Auth module (login/refresh/logout/me/jwks) → tests.
4. Users/roles module (port `rbac.ts` semantics; keep 30 s in-memory role cache **plus** publish `identity.role.updated` so other services invalidate).
5. Quota module (port `usage.ts`; internal consume endpoint).
6. Outbox events + `ai.usage.recorded` consumer.
7. Gateway route flags: switch `/api/auth/*`, `/api/signup`, `/api/admin/users*`, `/api/admin/roles*`, `/api/usage/*`, `/api/admin/usage*`, `/api/admin/credit-requests*` to `shadow` in `apps/gateway/routes.yaml` (not `service` yet — cutover is a human decision).
8. Backfill script + verification.

## Acceptance

```bash
pnpm --filter @fleetai/identity prisma migrate deploy && pnpm --filter @fleetai/identity seed
pnpm --filter @fleetai/identity test          # unit+integration green
pnpm --filter @fleetai/identity start & sleep 4
curl -sf localhost:4001/health/ready
curl -sf localhost:4001/.well-known/jwks.json | jq '.keys | length'   # >= 1
curl -s -XPOST localhost:4001/v1/auth/login -H 'content-type: application/json' -d '{"email":"'$SEED_USER'","password":"'$SEED_USER_PW'"}' | jq -r .accessToken | cut -c1-20
curl -sf localhost:4001/openapi.json | jq '.paths | keys | length'
```

## Do not

* Do not change permission strings or default role names.
* Do not store plaintext or seed passwords in the repo (env only).
* Do not let any other service read the `identity` database.
* Do not flip gateway flags to `service` — leave at `shadow`.

## Completion report

```
## Prompt 02 report
Endpoints implemented: <count> (list)
Events produced/consumed: <list>
Legacy behaviours preserved (quota rules, role cache, audit): <evidence>
Backfill: rows legacy vs new per table
Acceptance output: <paste>
Deviations / open questions
```
