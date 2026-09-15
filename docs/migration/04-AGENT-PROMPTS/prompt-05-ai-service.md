# Prompt 05 — `ai` service (widget generation, LLM providers, MCP servers, AI PIN, usage)

**Branch:** `feat/05-ai-service`  
**Depends on:** 00, 01, 10 merged; 04 merged (resolver catalog is needed to validate generated widgets). Parallel-safe with 06.  
**Phase:** 4  
**Port:** 4004 · **DB:** `ai` · **Package:** `@fleetai/ai`

## Role

You extract the AI assistant back-end: LLM provider registry, presets, MCP server registry, the
"generate/edit widget with AI" endpoint, AI PIN protection and LLM usage recording. This is the
second bottleneck of the monolith (long-running LLM calls inside the web process); it becomes an
async-capable service with a pgmq job queue and streaming responses.

## Read first

1. `AGENTS.md`
2. `docs/migration/01-TARGET-ARCHITECTURE/02-service-catalog.md` § ai
3. `docs/migration/06-REFERENCE/01-route-to-service-map.md` rows **ai**
4. `docs/migration/06-REFERENCE/02-model-to-service-map.md` — `LlmProvider`, `LlmUsage`, `McpServer`, `UserAiPin` (or field on User — check schema), `WidgetGeneration` (new)
5. `docs/migration/06-REFERENCE/03-event-catalog.md` — `ai.*`
6. Legacy (read fully):
   * `legacy/fleetai_dash/nextjs_space/lib/llm.ts` (provider abstraction, `UsageSink`, streaming), `lib/llm-presets.ts`, `lib/mcp.ts`
   * `legacy/fleetai_dash/nextjs_space/lib/usage.ts` (what is *recorded* here vs *enforced* in identity)
   * `legacy/fleetai_dash/nextjs_space/app/api/ai/generate-widget/route.ts` (order of checks: `ai.use` permission → 403, then PIN, then quota → 429; prompt construction; JSON repair; validation against widget contract)
   * `legacy/fleetai_dash/nextjs_space/app/api/user/ai-pin/route.ts`, `app/api/user/ai-pin/verify/route.ts`
   * `legacy/fleetai_dash/nextjs_space/app/api/admin/llm-providers/**`, `app/api/admin/mcp-servers/**` (incl. `MCP_CATEGORIES`), `app/api/mcp-servers/route.ts`
   * `legacy/fleetai_dash/nextjs_space/app/dashboard/_components/ai-assistant.tsx` and `widget-edit-chat.tsx` — read only to learn the request/response the UI expects (focused widget edit vs new widget, streaming or not)

## Deliverables

1. `services/ai`: Prisma schema (`LlmProvider`, `LlmPreset` if separate, `McpServer` w/ `category`, `AiPin` (userId + hash + attempts + lockedUntil), `LlmUsage` (raw records; identity keeps the aggregate), `WidgetGeneration` job table), migrations, seed (default providers/presets/MCP categories from legacy seed, secrets from env placeholders).
2. Endpoints: `POST /v1/ai/generate-widget` (sync, same contract as legacy; also `?stream=1` SSE variant), `POST /v1/ai/jobs/generate-widget` + `GET /v1/ai/jobs/:id` (async via pgmq for long prompts), `GET/PUT/POST /v1/user/ai-pin`, `POST /v1/user/ai-pin/verify`, admin LLM providers CRUD (+ `POST /:id/test`), admin MCP servers CRUD (+ `POST /:id/test`), `GET /v1/mcp-servers` (user-visible list).
3. Check order preserved exactly: permission `ai.use` (403) → PIN (401/423 when locked) → quota via identity `POST /internal/quota/consume` (429 with the same body shape as legacy).
4. Provider adapters: port `lib/llm.ts`; provider API keys read through `@fleetai/config` (env) or from encrypted DB column (`AES-256-GCM`, key from `AI_SECRETS_KEY`) — legacy stored them in `IntegrationSetting`/`LlmProvider`; document which.
5. Generated widgets validated with `@fleetai/widget-contracts` and with the metric catalog fetched from `fleet-metrics` `GET /internal/metrics/catalog` (cache 5 min) so the model cannot invent unknown metrics.
5a. **Custom code widgets:** the system prompt supports a `custom` widget type — the model returns self-contained HTML/CSS/JS in a `code` field for requests no built-in type can express (animations, canvas/SVG, odometers, radar, etc.). Port the legacy prompt's CUSTOM WIDGET RULES and DATA SHAPES verbatim, keep `maxTokens` high enough for code (legacy uses 4000), and forward the optional `runtimeError` from an edit request into the prompt so the model can self-repair broken code. Validation only checks the config envelope — the `code` string is opaque and is never executed server-side (it runs solely in the browser sandbox iframe). Also support the map-only `markerStyle`/`animate` fields. Never eval or render `code` in the service.
6. Events (outbox): `ai.usage.recorded` (tokens, cost, model, userId, feature), `ai.widget.generated`, `ai.provider.updated`, `ai.mcp-server.updated`, `audit.entry.recorded`.
7. Consumers: `identity.user.deleted` → delete pins/usage rows.
8. Tests: unit for prompt builder + JSON repair (fixtures from legacy behaviour), integration with a **fake OpenAI-compatible server** (`@fleetai/testing` provides `startFakeLlm()` returning canned completions) — never call real providers in tests; PIN lockout; check-order test (403 before PIN before 429).
9. Contracts, OpenAPI, README, `.env.example`, Helm values stub, compose entry.
10. Backfill script for `LlmProvider, McpServer, LlmUsage, AI pin data`.
11. Gateway flags `/api/ai/*`, `/api/user/ai-pin*`, `/api/admin/llm-providers*`, `/api/admin/mcp-servers*`, `/api/mcp-servers` → `shadow`.

## Steps

1. Copy `_template`; config schema (DB, Kafka, Redis, `IDENTITY_URL`, `FLEET_METRICS_URL`, internal HMAC, `AI_SECRETS_KEY`, default provider env keys).
2. Schema/migrations/seed.
3. Provider layer + fake LLM test server.
4. Generate-widget sync path with exact check order → tests.
5. PIN module; admin registries; MCP list.
6. Async job path (pgmq worker in the same process, concurrency from config) + SSE.
7. Events, consumer, backfill, flags.

## Acceptance

```bash
pnpm --filter @fleetai/ai prisma migrate deploy && pnpm --filter @fleetai/ai seed
pnpm --filter @fleetai/ai test
pnpm --filter @fleetai/ai start & sleep 4 && curl -sf localhost:4004/health/ready
# user WITHOUT ai.use -> 403 ; WITH ai.use but no PIN verified -> 401 ; quota exhausted -> 429
curl -s -o /dev/null -w '%{http_code}\n' -XPOST localhost:4004/v1/ai/generate-widget -H "authorization: Bearer $TOKEN_NO_AI" -d '{"prompt":"x"}' -H 'content-type: application/json'   # 403
curl -sf localhost:4004/openapi.json | jq '.paths | keys'
```

## Do not

* Do not call real LLM providers in tests.
* Do not enforce quota locally — identity owns quota; you only record usage and ask identity.
* Do not change the generate-widget response shape the UI consumes.
* Do not log prompts containing user data at info level (debug only, redacted).

## Completion report

```
## Prompt 05 report
Endpoints / events / consumers / jobs
Check-order test evidence (403→401/423→429)
Secret storage approach for provider keys
Acceptance output
Deviations / open questions
```
