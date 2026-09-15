# Prompt 00 — Bootstrap the monorepo

**Branch:** `feat/00-bootstrap-monorepo`  
**Depends on:** nothing (first prompt). `legacy/` and `docs/migration/` already exist in the repo.  
**Phase:** 1

## Role

You are a senior platform engineer setting up a pnpm + Turborepo monorepo that will host a
Next.js 16 frontend, a Fastify API gateway, and nine NestJS microservices. Nothing functional is
built in this prompt — you create the skeleton, tooling, CI and one *hello* service that proves the
toolchain works end to end.

## Read first (in this order)

1. `AGENTS.md` (repo root)
2. `docs/migration/02-MONOREPO/01-monorepo-layout.md` — the exact folder tree and `turbo.json`
3. `docs/migration/02-MONOREPO/02-conventions-and-ci.md` — lint/test/CI rules
4. `docs/migration/01-TARGET-ARCHITECTURE/01-target-architecture.md` § "Technology choices"
5. `legacy/fleetai_dash/nextjs_space/package.json` — only to note the dependency versions the UI already uses (keep them)

## Deliverables

1. Root: `package.json` (private, `packageManager: pnpm@9`), `pnpm-workspace.yaml` (`apps/*`, `services/*`, `packages/*`, `tests`), `turbo.json` exactly as in the layout doc, `.npmrc` (`node-linker=hoisted=false`, `strict-peer-dependencies=false`), `.nvmrc` (22), `.editorconfig`, `.gitignore`, `.gitattributes`.
2. Shared TS config package `packages/tsconfig` with `base.json`, `nest.json`, `next.json`, `library.json` (strict, ESM, `moduleResolution: bundler` for libs, `node16` for services).
3. Shared ESLint (flat config) + Prettier packages: `packages/eslint-config`. Rules: `@typescript-eslint/recommended-type-checked`, `import/order`, no `process.env` outside `packages/config` (custom `no-restricted-syntax` rule).
4. Empty-but-valid workspaces for every folder in the layout doc (each with `package.json`, `tsconfig.json`, `src/index.ts` exporting `{}` and a passing Vitest smoke test) so `pnpm turbo run build lint typecheck test` runs green across the whole tree from day one.
5. `services/_template` — a NestJS 11 + Fastify hello service generated from `docs/migration/05-TEMPLATES/service-skeleton.md`: `main.ts`, `app.module.ts`, `health.controller.ts` (`/health/live`, `/health/ready`), Vitest unit test, Dockerfile from `05-TEMPLATES/Dockerfile.service`. Later prompts copy this folder.
6. Root scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `infra:up`, `infra:down`, `db:migrate` (runs `prisma migrate deploy` in every service that has a `prisma/` folder), `format`.
7. `.github/workflows/ci.yml` implementing the *quality* job from the conventions doc (install with cache, `turbo run lint typecheck test build --filter=...[origin/main]`). Add `.github/CODEOWNERS` and `.github/pull_request_template.md` (from `05-TEMPLATES/pr-template.md`).
8. Agent ignore files at root: `.claudeignore`, `.clineignore`, `.opencodeignore` (content from `05-TEMPLATES/agent-ignore.example`).
9. `README.md` at repo root: what the repo is, how to install, link to `docs/migration/README.md`.
10. `docs/adr/0001-monorepo-tooling.md` using the ADR template, recording pnpm+Turborepo choice.

## Steps

1. Create root files and workspace folders. Do **not** install NestJS CLI globally; use `pnpm dlx @nestjs/cli` only if needed, otherwise hand-write the small skeleton.
2. Pin versions: `next@16`, `react@19`, `@nestjs/*@11`, `fastify@5`, `prisma@6`, `zod@3`, `kafkajs@2`, `ioredis@5`, `vitest@3`, `@playwright/test@1`, `typescript@5`. Use exact versions in root `pnpm.overrides` where needed for consistency.
3. Build `services/_template`, run it locally on port 4099, curl `/health/live`.
4. Build the Docker image for `_template` with the shared Dockerfile; run it; curl health.
5. Wire Turborepo caching (`outputs` per task) and verify a second `pnpm turbo run build` is fully cached.
6. Write CI; run `act` if available, otherwise dry-run the same commands locally.

## Acceptance (run all, paste output)

```bash
node -v                                     # v22.x
pnpm -v                                     # 9.x
pnpm install --frozen-lockfile
pnpm turbo run lint typecheck test build    # all green
pnpm --filter @fleetai/service-template start & sleep 3 && curl -sf localhost:4099/health/live
docker build -f services/_template/Dockerfile -t fleetai/service-template:dev . && echo IMAGE_OK
pnpm turbo run build --dry=json | jq '.tasks | length'   # > 0
```

## Do not

* Do not port any business logic yet.
* Do not create Prisma schemas yet (prompt 01/02+).
* Do not add Python, Makefiles with Python, or Bash-only tooling that will not run on Windows CI runners (use `pnpm` scripts + `tsx`).
* Do not touch `legacy/`.

## Suggested split (if context is tight)

* Session A: deliverables 1–4 (root + packages + empty workspaces).
* Session B: deliverables 5–10 (template service, CI, docs).

## Completion report (paste into PR)

```
## Prompt 00 report
Created: <list of top-level folders/files>
Versions pinned: node, pnpm, next, nest, prisma, fastify, zod, kafkajs, vitest, playwright
Acceptance output: <paste>
Deviations from docs (with reason): <none | list>
Open questions for humans: <none | list>
```
