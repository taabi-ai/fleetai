# Prompt 14 — Hardening, resilience and load testing

**Branch:** `feat/14-hardening-load`  
**Depends on:** all service prompts (02–11) and 12, 13 merged.  
**Phase:** 9

## Role

You prove the platform is actually more scalable and resilient than the monolith, and you close
the gaps that always appear once everything runs together: timeouts, retries, circuit breakers,
idempotency keys, pagination limits, N+1 event storms, DLQ handling, secret scanning, SBOMs.

## Read first

1. `AGENTS.md`
2. `docs/migration/00-CONTEXT/02-scalability-assessment.md` § ceilings (your baseline to beat)
3. `docs/migration/03-MIGRATION-PLAN/03-risk-register.md` (R1–R12 — each needs evidence of mitigation)
4. `docs/migration/02-MONOREPO/02-conventions-and-ci.md` § load tests
5. `tests/load/*` written so far

## Deliverables

1. **Resilience library defaults** in `@fleetai/nest-common` and gateway: outbound HTTP client with timeouts (connect 2 s, total 10 s), retries with jitter for idempotent calls only, circuit breaker (`opossum` or hand-rolled) per upstream, bulkhead concurrency limits; Kafka consumers with bounded retry then DLQ; pgmq workers with visibility-timeout renewal and poison-message archive.
2. **Idempotency keys** on all `POST` create endpoints that the UI may retry (`Idempotency-Key` header → Redis 24 h) — at minimum dashboards, widgets, media presign/complete, training progress, ingest.
3. **Pagination caps** (max 200/page) and query timeouts (Prisma `statement_timeout` 5 s — same as legacy managed DB) on every list endpoint.
4. **Load tests (k6)** in `tests/load/`: `dashboard-read.js` (200 VUs, 5 min, mixed dashboard + widget data), `ai-generate.js` (20 VUs, fake LLM), `ingest-positions.js` (target 10 000 pos/s), `auth-login.js` (bcrypt cost sanity); thresholds encoded in scripts; results committed as `tests/load/results/<date>.md` with p50/p95/p99, error %, consumer lag, pod counts before/after autoscaling.
5. **Chaos checks** (scripts under `tests/chaos/`, run against kind or compose): kill Redpanda for 60 s → outbox backlog drains, zero lost events; kill fleet-metrics → dashboard returns cached/degraded widget data (`stale: true`) not 500; kill Redis → rate-limit fails open with warning, cache bypassed; kill identity → gateway keeps validating with cached JWKS for 1 h.
6. **Contract tests** across services (`tests/contract/`): each consumer test loads producer schema from `packages/events` — CI fails if a producer bumps a schema version without consumers declaring support.
7. **Security hardening**: `gitleaks` in CI, `pnpm audit --prod` gate (high+), SBOM per image (`syft`) uploaded as artifact, Trivy image scan, Dockerfiles non-root + read-only FS + `NODE_OPTIONS=--max-old-space-size` sized to limits, dependency-review workflow.
8. **Data-loss safeguards**: backup/restore runbook per database (pg_dump + MinIO mirror), PITR notes for managed PG, restore drill script that restores into a scratch DB and runs row-count verification.
9. Update `docs/migration/00-CONTEXT/02-scalability-assessment.md` with a new section "After migration — measured" containing real numbers from the load tests (never estimated).

## Steps

1. Resilience defaults + tests.
2. Idempotency + pagination caps.
3. Load tests → baseline run → tune (indexes, cache TTLs, batch sizes) → re-run.
4. Chaos scripts.
5. Security + backup runbooks + doc update.

## Acceptance

```bash
pnpm turbo run test                              # all green
k6 run tests/load/dashboard-read.js              # thresholds pass
k6 run tests/load/ingest-positions.js            # thresholds pass
pnpm tsx tests/chaos/kill-redpanda.ts            # reports 0 lost events
gitleaks detect --no-git -v                      # 0 leaks
pnpm audit --prod --audit-level=high             # exit 0
```

## Do not

* Do not lower k6 thresholds to make tests pass — fix the system or document the ceiling honestly.
* Do not fabricate numbers in the scalability doc; paste k6 summaries.

## Completion report

```
## Prompt 14 report
Measured: dashboard p95, ingest pos/s, AI p95, login p95 (before tuning / after)
Chaos results per scenario
Security gates added
Risk register items with evidence: R1..R12
Acceptance output
Deviations / open questions
```
