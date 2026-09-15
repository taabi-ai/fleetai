# Prompt 11 — Port the Next.js 16 frontend into `apps/web`

**Branch:** `feat/11-web-frontend-port`  
**Depends on:** 00, 01, 10 merged. Parallel-safe with 10 if you stub the gateway URL.  
**Phase:** 2  
**Port:** 3000 · **Package:** `@fleetai/web`

## Role

You move the UI out of the monolith into the monorepo **without changing what users see**. The
only functional change: every server-side or client-side call to `/api/*` goes to the gateway
(`NEXT_PUBLIC_API_BASE_URL`) instead of the co-located route handlers, and the route handlers
themselves are **not** copied (the monolith keeps serving them behind the gateway until each
service takes over).

## Read first

1. `AGENTS.md`
2. `docs/migration/00-CONTEXT/01-current-architecture.md` § frontend
3. `docs/migration/02-MONOREPO/01-monorepo-layout.md` § apps/web
4. Legacy (copy sources from here):
   * `legacy/fleetai_dash/nextjs_space/app/**` **except** `app/api/**`
   * `legacy/fleetai_dash/nextjs_space/components/**`, `hooks/**`, `lib/utils.ts`, `lib/types.ts`, `lib/widget-meta.ts`, `lib/widget-colors.ts`, `lib/upload-client.ts`, `lib/llm-presets.ts` (client-side names only)
   * `legacy/fleetai_dash/nextjs_space/public/**`, `app/globals.css`, `tailwind.config.ts`, `components.json`, `next.config.js`, `STYLE_GUIDE.md`
   * `legacy/fleetai_dash/nextjs_space/auth.ts` and `types/next-auth.d.ts` — to understand how pages call `auth()`; you will replace this with a thin session adapter.
   * `legacy/fleetai_dash/nextjs_space/tests/e2e/*.spec.ts` — the 11 Playwright e2e specs; they are your regression suite.

## Deliverables

1. `apps/web` = the legacy `nextjs_space` minus `app/api`, `prisma`, `scripts`, `lib/db.ts`, `lib/mock-data.ts` and every server-only lib (`audit, env, rbac, usage, storage, media, training, dora, integrations, llm, mcp, mailer, notify, admin, access, aws-config, weather-api`). Anything a page imported from those must now be fetched from the gateway.
2. `lib/api-client.ts`: typed fetch wrapper using `@fleetai/contracts` Zod schemas for responses; base URL from `NEXT_PUBLIC_API_BASE_URL`; attaches `Authorization` from the session; server components use it with `cache: 'no-store'` where legacy used dynamic data.
3. Session: keep next-auth **only as a cookie/session holder** (Credentials provider whose `authorize` calls gateway `POST /api/auth/login` (legacy path, so it works before identity is extracted) and stores the returned tokens in the JWT session; refresh handled in the `jwt` callback). Provide `auth()` with the same return shape pages expect (`session.user.{id,email,name,role}` + `perms`). When prompt 02 lands, only the login URL changes.
4. Server components that previously called Prisma directly (grep `from '@/lib/db'` in legacy `app/**/page.tsx`) are rewritten to call the api-client. Keep `export const dynamic = 'force-dynamic'` where present.
5. Keep: theme, Taabi branding assets, `FloatingAssistant`, `WidgetEditChat` anchoring, `data-testid`/`aria-label` hooks used by e2e tests, `<script src="https://apps.abacus.ai/chatllm/appllm-lib.js">` only if `NEXT_PUBLIC_ENABLE_APPLLM=1` (default off outside the Abacus host).
5b. Port the **custom-widget sandbox** unchanged: `custom-widget.tsx` renders `widgetConfig.code` inside `<iframe sandbox="allow-scripts" srcDoc=...>` (NO `allow-same-origin` — the opaque origin is the security boundary; never add it). The parent pushes `{type:'fleetai:data',data,theme}` via `postMessage` and only accepts messages from that frame's `contentWindow`; the frame posts `fleetai:ready`/`fleetai:error`. Runtime errors bubble up to the AI edit chat (`runtimeError` in the generate request) so the assistant can self-repair. Add `frame-src 'self'` is NOT required (srcDoc frame); do NOT relax the sandbox in CSP. Also port the map options `markerStyle`/`animate` in `map-content.tsx` (SVG divIcons + rAF orbit animation).
6. New Relic RUM component reads `GET /api/public-config` (gateway → legacy today, platform-config later).
7. `apps/web/Dockerfile` (standalone output), Helm stub, compose entry, `.env.example`, README.
8. Move legacy `tests/` (Playwright api+e2e, TypeScript) into monorepo `tests/` with `QA_BASE_URL` pointing at the gateway/web; all 11 e2e specs and the api specs that target still-`legacy` routes must pass against `web(3000) → gateway(4000) → legacy monolith`.
9. Bundle check: `next build` succeeds with zero server-only lib imports (add an ESLint `no-restricted-imports` rule for `@prisma/client`, `@/lib/db`).

## Steps

1. Copy sources; delete server-only parts; fix imports until `pnpm --filter @fleetai/web typecheck` is clean.
2. api-client + session adapter.
3. Rewrite server components page by page (list them in the report).
4. Run the legacy monolith locally (from its own checkout, port 3001), gateway on 4000 with `LEGACY_URL=http://localhost:3001`, web on 3000.
5. Run e2e suite; fix regressions; take screenshots of dashboard/admin/training for the PR.

## Acceptance

```bash
pnpm --filter @fleetai/web typecheck && pnpm --filter @fleetai/web lint && pnpm --filter @fleetai/web build
rg -n "@/lib/db|@prisma/client|lib/mock-data" apps/web/ | wc -l        # 0
QA_BASE_URL=http://localhost:3000 pnpm test:e2e                        # 11/11 e2e pass
```

## Do not

* Do not redesign UI, rename components, or change Tailwind theme values.
* Do not copy `app/api/**` route handlers.
* Do not talk to any database from `apps/web`.
* Do not change the widget config contract or dashboard layout JSON.

## Suggested split

* Session A: copy + prune + typecheck-clean.
* Session B: api-client + session + server component rewrites.
* Session C: e2e green + Docker/Helm/docs.

## Completion report

```
## Prompt 11 report
Pages rewritten to api-client: <list>
Server-only libs removed: <list>
e2e: <n>/11 pass ; api specs: <n>/<m>
Acceptance output
Deviations / open questions
```
