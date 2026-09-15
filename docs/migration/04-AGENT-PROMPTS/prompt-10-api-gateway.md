# Prompt 10 — API gateway (strangler-fig facade)

**Branch:** `feat/10-api-gateway`  
**Depends on:** 00, 01 merged. Parallel-safe with 11.  
**Phase:** 2 — must exist before any service takes traffic.  
**Port:** 4000 · **Package:** `@fleetai/gateway`

## Role

You build the single entry point that lets the platform migrate route-by-route. Every legacy
`/api/*` path is declared in `routes.yaml` with a flag `legacy | shadow | service`. The gateway
validates JWTs (or, during transition, legacy next-auth session cookies), enforces rate limits,
propagates trace context, and forwards to the monolith or to the owning service.

## Read first

1. `AGENTS.md`
2. `docs/migration/01-TARGET-ARCHITECTURE/01-target-architecture.md` § request flow
3. `docs/migration/01-TARGET-ARCHITECTURE/06-security-observability.md` (deny-list, internal header, rate limits, CORS)
4. `docs/migration/03-MIGRATION-PLAN/01-phased-roadmap.md` § route flag mechanics (`legacy|shadow|service`)
5. `docs/migration/06-REFERENCE/01-route-to-service-map.md` — **all 61 routes**; this is your `routes.yaml`
6. Legacy: `legacy/fleetai_dash/nextjs_space/auth.ts` (session cookie name/JWT strategy so the gateway can validate legacy sessions during transition using `NEXTAUTH_SECRET`), `legacy/fleetai_dash/nextjs_space/proxy.ts` if present (route protection rules), `app/api/health/route.ts`

## Deliverables

1. `apps/gateway` Fastify 5 app with plugins: `@fastify/http-proxy` (streaming, websockets passthrough), `@fastify/rate-limit` (Redis store; per-IP anonymous, per-user authenticated, per-key for `/ingest`), `@fastify/cors`, `@fastify/helmet` (no `X-Frame-Options: DENY` — UI is embedded in iframes), request-id + `traceparent` propagation via `@fleetai/observability`.
2. `apps/gateway/routes.yaml`: one entry per legacy route from the reference map: `path, methods, service, servicePath, flag, permission?, public?`. Initially **every flag = `legacy`** except `/api/health` which the gateway answers itself (aggregating downstream health).
3. Flag semantics:
   * `legacy` → proxy to `LEGACY_URL` (the running monolith).
   * `shadow` → proxy to legacy **and** asynchronously replay the same request to the service; compare status + normalised JSON body; emit metric `gateway_shadow_mismatch_total{route}` and log a redacted diff sample (max 1/min/route). Never affects the client response. Skip shadowing for non-idempotent methods unless `shadowWrites: true` is set on the route (default false).
   * `service` → proxy to the service; add `x-fleetai-internal` HMAC header and `x-fleetai-principal` (JSON of verified claims) so services can trust identity without re-verifying (they still verify when called directly).
4. Auth: accept `Authorization: Bearer <RS256 JWT>` (JWKS from `IDENTITY_URL`, cached, rotated) **or** legacy next-auth session cookie (decode with `NEXTAUTH_SECRET`, same algorithm as legacy `auth.ts`); normalise both to a `Principal`. Public routes per `routes.yaml`. Permission pre-check from `permission` column (services still enforce).
5. Temporary adapter for prompt 04: route `/api/widgets/data` with `service: fleet-metrics` maps legacy body to `POST /internal/metrics/resolve` and maps response back unchanged (remove in prompt 03 when `dashboard` takes over).
6. Hot reload of `routes.yaml` (SIGHUP or file watch) so flags can be flipped without redeploy; also a `PATCH /admin/gateway/routes/:id/flag` endpoint guarded by `admin.*` + internal header (used by the cutover runbook).
7. Observability: per-route latency histogram, upstream error counter, shadow mismatch counter; `/metrics`; structured access log (no bodies, no tokens).
8. Tests: Vitest with stub upstreams (legacy stub + service stub) covering the three flags, shadow-diff redaction, both auth methods, rate-limit 429, hot reload; Playwright API test hitting a real compose stack in `tests/api/gateway.spec.ts`.
9. Dockerfile, Helm stub, compose entry, README (how to flip a flag; how shadow diffs are read).

## Steps

1. Scaffold Fastify app + config schema (`LEGACY_URL`, `IDENTITY_URL`, service URLs map, `NEXTAUTH_SECRET` (transition only), Redis, HMAC secret, rate limits).
2. Generate `routes.yaml` from the reference map (write a small `scripts/gen-routes.ts` that parses the markdown table so the two never drift; CI check that they match).
3. Auth normalisation.
4. Proxy + flags + shadow.
5. Adapter route; hot reload; admin flag endpoint.
6. Tests; docs.

## Acceptance

```bash
pnpm --filter @fleetai/gateway test
pnpm --filter @fleetai/gateway check:routes            # routes.yaml == reference map
LEGACY_URL=http://localhost:3000 pnpm --filter @fleetai/gateway start & sleep 3
curl -sf localhost:4000/api/health | jq '.gateway,.legacy'
curl -s -o /dev/null -w '%{http_code}\n' localhost:4000/api/dashboard      # 401 without auth
for i in $(seq 1 200); do curl -s -o /dev/null localhost:4000/api/health; done; curl -s -o /dev/null -w '%{http_code}\n' localhost:4000/api/health   # 429 once anonymous limit hit
```

## Do not

* Do not implement business logic in the gateway.
* Do not buffer response bodies for `legacy`/`service` proxies (stream); buffering is allowed only for shadow comparison, capped at 1 MB.
* Do not set `X-Frame-Options: DENY` or `SAMEORIGIN`.
* Do not log request bodies, cookies or tokens.

## Completion report

```
## Prompt 10 report
routes.yaml entries: <n> (must equal reference map count)
Auth methods supported; shadow diff behaviour
Acceptance output
Deviations / open questions
```
