# CLAUDE.md

@AGENTS.md

Claude Code specific notes:

* Read `AGENTS.md` (imported above) first; it contains all repository rules and the Definition of Done.
* Prefer `rg` for search. Do **not** grep or read `legacy/` wholesale — each prompt lists the exact legacy files to open.
* Use plan mode (`shift+tab`) for prompts 00, 01, 04, 10, 11; confirm the plan against `docs/migration/03-MIGRATION-PLAN/01-phased-roadmap.md` before editing.
* Commit in small logical steps on the branch named in the prompt; never commit to `main`.
* Before declaring done, run the prompt's acceptance commands and include their real output in the completion report.
* If a command needs Docker (Testcontainers, `pnpm infra:up`) and Docker is unavailable, stop and say so — do not mock the database to get green tests.
* Never print `.env` files or secret values.
