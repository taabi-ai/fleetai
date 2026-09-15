## What

<!-- one paragraph -->

## Prompt / phase

- Prompt: `docs/migration/04-AGENT-PROMPTS/prompt-NN-*.md`
- Phase: N

## Checklist (Definition of Done — AGENTS.md §5)

- [ ] `pnpm turbo run lint typecheck test` green for affected workspaces (output in report below)
- [ ] New/changed endpoints have Zod contracts + OpenAPI + integration tests
- [ ] New events registered in `packages/events` and `docs/migration/06-REFERENCE/03-event-catalog.md`; consumer idempotency test present
- [ ] New tables have committed migrations; `02-model-to-service-map.md` updated
- [ ] New env vars in `.env.example`, Helm values and `04-env-var-matrix.md`
- [ ] Every mutating endpoint has `@Audited()`
- [ ] No `process.env` outside `@fleetai/config`; no cross-database access; no imports from `legacy/`
- [ ] No secrets, tokens or `.env` contents in the diff
- [ ] Service README updated
- [ ] Gateway `routes.yaml` flags updated (state which routes moved to `shadow`/`service`)

## Completion report

<!-- paste the report block from the prompt, with REAL command output -->

## Screenshots / evidence

<!-- optional -->
