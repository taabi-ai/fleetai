# 03 · Risk register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | Distributed-monolith anti-pattern: services call each other synchronously in chains | Med | High | Rule: sync calls only gateway→service; service→service only for backfills; everything else events + read-models. Lint rule in `@fleetai/nest-common` forbidding `axios`/`fetch` to sibling hosts outside `backfill/` | Architect |
| R2 | Data drift during dual-write window | Med | High | Debezium CDC or outbox from `withAudit`; nightly `--verify` diff; shadow mode | Service owner |
| R3 | Managed PostgreSQL without `pgmq`/`timescaledb` (Azure Flexible: no pgmq; RDS: no timescale) | High | Med | `@fleetai/queue` shim fallback; native partitioning + `pg_cron` roll-up path documented | Platform |
| R4 | JWT migration logs everyone out / breaks API clients | Med | Med | Copy bcrypt hashes as-is; run identity in shadow validating both Auth.js cookie and new JWT for 2 weeks; refresh-token grace | Identity |
| R5 | AI streaming regressions (SSE through gateway) | Med | Med | Redis Streams so any gateway replica serves; e2e test for stream; fallback polling `GET /ai/jobs/:id` | AI |
| R6 | Widget metric numbers differ after port (aggregation edge cases, timezone) | High | Med | Golden-file test: 25 metrics × fixed seed compared byte-for-byte to legacy output captured before migration | Metrics |
| R7 | Cost: Redpanda + Redis + per-service DBs on small deployments | Med | Low | Single-node compose profile; `core` combined deployable option; managed tiers sized in 05-infra | Platform |
| R8 | Agent scope creep / inconsistent patterns across services | High | Med | `AGENTS.md` rules; service skeleton template; one shared-package owner; PR template checklist | Tech lead |
| R9 | Audit gaps after split (the monolith guaranteed "every mutation logged") | Med | High | `@Audited()` mandatory; integration test in `@fleetai/nest-common` asserts every `POST/PUT/PATCH/DELETE` route has the decorator (reflect metadata scan at boot, fail startup if missing) | All |
| R10 | Telemetry ingest floods DB | Med | High | Batch `COPY`, partition by day, retention policy, KEDA, back-pressure at ingest-api (429 with Retry-After) | Metrics |
| R11 | Secrets leakage into repo by agents | Low | High | gitleaks pre-commit + CI; `.env` ignored; External Secrets in prod | All |
| R12 | Rollback difficulty after flag flip | Med | Med | Short rollback window documented; reverse CDC option; read-only mode switch in gateway | SRE |
