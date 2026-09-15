# FleetAI Dash → Mono-repo Microservices Migration Pack

_Version 1.1 · 2026-09-08 · Produced from the live codebase at `fleetai_dash/` (34 Prisma models, 79 API routes, ~30 `lib/*` modules)._

> **v1.1 changelog:** the AI widget assistant now does "both worlds" — easy config edits *and* on-the-fly `custom` code widgets. The frozen widget-config contract gains three fields (`markerStyle`, `animate`, `code`); `type` gains `custom` (self-contained HTML/CSS/JS run in a sandboxed `srcDoc` iframe, fed live metric data over `postMessage`). Reflected in `00-CONTEXT/01`, `04-AGENT-PROMPTS/prompt-05` (ai service) and `prompt-11` (web frontend). No new services or Prisma models — the change is confined to the ai and web/dashboard boundaries.

This pack is written **for AI coding agents** (Claude Code, Cline, OpenCode, Muse Code, Cursor, etc.) and the humans supervising them. Every document is self-contained, cites the exact source files it refers to, and ends with acceptance criteria the agent must satisfy before moving on.

## What you are migrating

| Today | Target |
|---|---|
| One Next.js 16 application (`nextjs_space/`) that serves the UI **and** all 78 API routes | A **pnpm + Turborepo mono-repo** with 1 web app, 1 API gateway/BFF, 9 independently deployable services, shared packages |
| One PostgreSQL database, 34 tables, one Prisma schema | **Database-per-service** (9 logical databases / schemas), each with its own Prisma schema + migrations |
| No queue, no cache, no event bus — async work runs inline in request handlers | **Redpanda (Kafka API)** for domain events & telemetry, **pgmq** for per-service job queues, **Redis** for cache/sessions/rate-limits/SSE fan-out, **MinIO** for objects |
| k8s manifests deploy the single container with HPA 2→6 | Helm umbrella chart, one sub-chart per service, KEDA for consumer autoscaling |

Read `00-CONTEXT/02-scalability-assessment.md` first for the honest answer to *"is the monolith scalable?"*

## How to use this pack with an agent

1. Create a **new, empty repository** (e.g. `fleetai-platform`). Do **not** migrate in place — the monolith keeps running in production while services are built beside it (strangler-fig).
2. Copy this whole folder into the new repo as `docs/migration/`. Copy `04-AGENT-PROMPTS/AGENTS.md`, `CLAUDE.md` and `.clinerules` to the **repo root** — agents read these automatically.
3. Put a copy (or a git submodule / read-only checkout) of the current monolith at `legacy/fleetai_dash/` so the agent can read the original code it is porting. The latest source archive is `fleetai_dash-source-2026-09-07.zip`.
4. Run the prompts in `04-AGENT-PROMPTS/` **in numeric order**, one prompt per agent session. Each prompt tells the agent which docs to read, what to build, and how to prove it works. Never skip `prompt-00` and `prompt-01` — every later prompt depends on them.
5. After each prompt: run `pnpm turbo test lint typecheck`, review the diff, commit. Tag milestones per `03-MIGRATION-PLAN/01-phased-roadmap.md`.

## Folder map

```
00-CONTEXT/                 what exists today (inventory, honest scalability review)
01-TARGET-ARCHITECTURE/     target design, service catalog, data ownership, ADRs (Kafka vs pgmq, Redis, MinIO)
02-MONOREPO/                repo layout, tooling, conventions, CI
03-MIGRATION-PLAN/          phased strangler-fig roadmap, checklists, risk register, cut-over runbook
04-AGENT-PROMPTS/           16 ordered prompts + AGENTS.md / CLAUDE.md / .clinerules for the new repo
05-TEMPLATES/               service skeleton, Dockerfile, Helm values, event schema, ADR, docker-compose.dev
06-REFERENCE/               route → service map, model → service map, event catalog, env-var matrix
```

## Ground rules the agent must follow (repeated in AGENTS.md)

- TypeScript everywhere; tests are **TypeScript (Vitest) + Playwright** — never Python.
- No mock/random data in any service. Fleet metrics come from the `fleet-metrics` database or from real ingestion.
- Every service owns its tables. **No service may query another service's database.** Cross-service reads go through APIs or replicated read-models fed by events.
- Every mutating endpoint emits an `audit.*` event (the monolith's `withAudit()` rule survives the split).
- Additive database migrations only; destructive changes need an ADR.
- Docs (`README`, `CHANGELOG`, `DEPLOYMENT`) stay in sync with code in the same PR.
