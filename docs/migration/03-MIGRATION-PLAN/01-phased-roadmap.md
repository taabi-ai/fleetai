# 01 · Phased roadmap (strangler-fig)

The monolith stays in production throughout. Each phase ends with a **tagged, deployable state** where users see no difference. Effort is in agent-sessions (one prompt ≈ one focused session) plus human review; wall-clock depends on review cadence.

| Phase | Goal | Prompts | Exit criteria |
|---|---|---|---|
| **0 · Stabilise monolith** (optional but recommended, in the *legacy* repo) | Buy headroom while services are built | — (small tasks) | PgBouncer in front of PG; Redis cache on `/api/widgets/data`; LLM calls behind pgmq shim (PGMQ_PLAN Track A); metrics exported |
| **1 · Foundation** | Empty mono-repo that builds, tests and runs the infra stack | 00, 01 | `pnpm turbo build test` green; `docker compose -f infra/docker-compose.dev.yml up` gives PG(9 dbs)+Redpanda+Redis+MinIO+OTel; all `packages/*` published internally with tests |
| **2 · Gateway + web shell** | Web UI served from new repo, **all** `/api/*` proxied to legacy monolith | 10, 11 | Legacy `tests/api` (122) + `tests/e2e` (11) pass through the gateway with `ROUTE_*=legacy`; login works; no service yet owns data |
| **3 · fleet-metrics + ingest** | First real service; biggest scalability win | 04, 09 (topics), 13 (partial) | `/widgets/data` served by service (`ROUTE_metrics=service`); Redis cache hit-ratio metric; telemetry topic → hypertable → DailyStat roll-up; seed reproduces monolith numbers exactly (compare 25 metrics — the monolith's verification approach) |
| **4 · ai** | Async AI jobs with SSE streaming | 05 | `generate-widget` behaviour identical from the UI; quota/429; usage recorded; worker scales with pgmq depth (KEDA in dev via compose replica test) |
| **5 · identity** | Own auth; JWKS; RBAC unchanged | 02 | All existing users log in with existing passwords (bcrypt hashes copied); roles/permissions identical; gateway verifies JWT offline; legacy Auth.js disabled |
| **6 · dashboard** | Dashboards/widgets/library/marketplace | 03 | 21 dashboards / 94 widgets migrated with same ids; `dashboard.spec.ts` green; user_summary read-model populated |
| **7 · platform-config + notification + engineering** (may ship as one `core` deployable first) | Config, audit, menu, integrations, e-mail, DORA/CRM | 06, 09 (audit consumer) | Audit rows flow from every service; `getEnv` semantics preserved; e-mails sent by worker; DORA webhook token check preserved |
| **8 · media + training** | Objects on MinIO/S3, training modules | 07, 08 | Existing 6 MediaAssets + 2 modules/6 lessons migrated; presigned uploads ≤100MB single / >100MB multipart preserved |
| **9 · Observability, k8s, hardening** | Production readiness | 12, 13, 14 | Helm deploy to staging; Grafana dashboards; alerts; load test targets met (`/widgets/data` p95 < 800 ms @ 200 rps; ingest 2 k msg/s sustained on 2 consumer pods) |
| **10 · Cut-over & decommission** | Legacy retired | 15 | All `ROUTE_*=service`; legacy pods scaled to 0 for 2 weeks; legacy DB tables dropped after verification; DNS unchanged (gateway already behind it) |

## Ordering rationale

fleet-metrics goes first because (a) it is the *only* place the monolith already isolates data access (`lib/mock-data.ts` → 8 tables, one route), (b) it delivers the scalability the user doubts, (c) it has no auth complexity of its own. Identity is deliberately **not** first: swapping auth while everything else is still in the monolith doubles the risk surface; doing it after two services are proven lets the gateway pattern mature.

## Route flag mechanics (gateway)

```
ROUTE_metrics=legacy|shadow|service
```
- `legacy`: proxy to monolith.
- `shadow`: proxy to monolith, **also** call service asynchronously and diff responses → log `shadow_mismatch_total{route}`. Use for a week before flipping.
- `service`: proxy to service; monolith route returns 410 Gone.

## Parallelism for multiple agents

After Phase 1, services are independent packages. Two or three agents can run prompts 02–09 in parallel branches **provided** `packages/contracts` and `packages/events` changes go through a single integration branch first (they are the shared surface). Never let two agents edit the same package concurrently.
