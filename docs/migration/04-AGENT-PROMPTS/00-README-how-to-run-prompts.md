# How to run the prompts (Claude Code, Cline, OpenCode, Muse Code, Roo, Aider…)

This folder contains **three repo-root instruction files** and **16 numbered task prompts**.
The prompts are written for *agentic* coding tools: each one is self-contained, names the exact
documents and legacy files to read, lists concrete deliverables, and ends with acceptance commands
the agent must run before it may declare the task done.

## 1. One-time setup of the new repository

```bash
mkdir fleetai-platform && cd fleetai-platform && git init

# a) copy this documentation pack
mkdir -p docs/migration
cp -r <pack>/00-CONTEXT <pack>/01-TARGET-ARCHITECTURE <pack>/02-MONOREPO \
      <pack>/03-MIGRATION-PLAN <pack>/04-AGENT-PROMPTS <pack>/05-TEMPLATES \
      <pack>/06-REFERENCE <pack>/README.md docs/migration/

# b) agent instruction files go to the REPO ROOT (tools look for them there)
cp <pack>/04-AGENT-PROMPTS/AGENTS.md   ./AGENTS.md      # OpenCode, Codex, Muse, Aider, Jules
cp <pack>/04-AGENT-PROMPTS/CLAUDE.md   ./CLAUDE.md      # Claude Code
cp <pack>/04-AGENT-PROMPTS/.clinerules ./.clinerules    # Cline / Roo Code

# c) put the CURRENT monolith source in legacy/ (read-only reference, never run from here)
mkdir -p legacy
unzip fleetai_dash-source-2026-09-07.zip -d legacy/     # -> legacy/fleetai_dash/nextjs_space/...

git add -A && git commit -m "chore: import migration docs + legacy monolith snapshot"
```

The `legacy/` folder is what every prompt means by **`legacy/fleetai_dash/nextjs_space/...`**.

## 2. Running a prompt

Open the agent in the repo root and paste the *entire* prompt file as the first message, e.g.

```
# Claude Code
claude "$(cat docs/migration/04-AGENT-PROMPTS/prompt-00-bootstrap-monorepo.md)"

# OpenCode
opencode run "$(cat docs/migration/04-AGENT-PROMPTS/prompt-00-bootstrap-monorepo.md)"

# Cline / Roo: open the file, select all, paste into the task box (Plan mode first, then Act).
```

Rules of thumb:

1. **Run prompts in numeric order** unless the roadmap (`03-MIGRATION-PLAN/01-phased-roadmap.md`)
   says they are parallel-safe. Dependencies are declared at the top of every prompt.
2. **One prompt = one branch = one PR.** Branch name is given in each prompt.
3. Do not start a prompt until the previous PR's acceptance commands pass on `main`.
4. If the agent asks a question that the docs already answer, point it to the file — do not improvise.
5. When a prompt is too big for one context window, the prompt itself contains a *"Suggested
   split"* section; run those sub-steps as separate sessions on the same branch.
6. After each prompt, ask the agent for the **completion report** (template at the end of every
   prompt) and paste it into the PR description.

## 3. Prompt index

| # | File | Phase | Parallel-safe with |
|---|------|-------|--------------------|
| 00 | prompt-00-bootstrap-monorepo.md | 1 | — |
| 01 | prompt-01-shared-packages-and-infra.md | 1 | — |
| 02 | prompt-02-identity-service.md | 5 | 03, 06 |
| 03 | prompt-03-dashboard-service.md | 6 | 02, 06 |
| 04 | prompt-04-fleet-metrics-service.md | 3 | 09 |
| 05 | prompt-05-ai-service.md | 4 | 06 |
| 06 | prompt-06-platform-config-service.md | 7 | 02, 03, 05 |
| 07 | prompt-07-media-service.md | 8 | 08 |
| 08 | prompt-08-training-service.md | 8 | 07 |
| 09 | prompt-09-notification-engineering-audit.md | 3/7 | 04 |
| 10 | prompt-10-api-gateway.md | 2 | 11 |
| 11 | prompt-11-web-frontend-port.md | 2 | 10 |
| 12 | prompt-12-observability.md | 9 | 13 |
| 13 | prompt-13-helm-k8s-keda.md | 3 (partial) / 9 | 12 |
| 14 | prompt-14-hardening-and-load-tests.md | 9 | — |
| 15 | prompt-15-cutover-decommission.md | 10 | — |

Recommended real-world order: **00 → 01 → 10 → 11 → 04 → 09 → 13(partial) → 05 → 02 → 03 → 06 → 07 → 08 → 12 → 13 → 14 → 15**.

## 4. Model / context advice

* Use the largest-context model available for prompts 00, 01, 04, 10 and 11 (they read many files).
* Keep `legacy/` out of the agent's default file index if the tool supports ignore files
  (`.claudeignore`, `.clineignore`, `.opencodeignore`) — prompts tell the agent exactly which
  legacy files to open, so indexing 300+ files only wastes context. A ready-made ignore list is in
  `05-TEMPLATES/agent-ignore.example`.
