# 02 · Engineering conventions & CI

## Code

- TypeScript `strict`; no `any` outside `*.d.ts`; ESLint (`@typescript-eslint`, `eslint-plugin-import`, `unicorn` subset) + Prettier; commit hooks via `lefthook` (typecheck + lint affected).
- Domain-first folders inside a service: `src/<aggregate>/{<aggregate>.module.ts, controller.ts, service.ts, repository.ts, dto/, events/}`.
- Repositories are the **only** place Prisma is called. Services (use-cases) never import `@prisma/client` types into DTOs.
- All request/response DTOs are Zod schemas from `@fleetai/contracts`, validated by a global `ZodValidationPipe`.
- Errors: RFC 9457 problem+json `{type,title,status,detail,instance,traceId}`; Nest exception filter in `@fleetai/nest-common`.
- Money in INR minor units (paise) as `bigint`; timestamps `timestamptz` UTC; ids stay cuid strings for migrated rows, uuidv7 for new aggregates.
- No `Math.random()` in production paths. Test data uses `@fleetai/testing` mulberry32.
- Feature flags via `platform-config` keys `flag.<name>`; route ownership flags in gateway `ROUTE_<service>=legacy|service|shadow`.

## Testing pyramid (TypeScript only)

| Level | Tool | Where | Gate |
|---|---|---|---|
| Unit | Vitest | `src/**/*.spec.ts` | every PR, affected |
| Integration | Vitest + Testcontainers (PG+pgmq, Redpanda, Redis, MinIO) | `test/int/**/*.int.ts` | every PR, affected |
| Contract | Zod-generated OpenAPI diff (`openapi-diff`, fail on breaking) + consumer tests in gateway | `tests/contract/` | every PR touching contracts |
| API regression | **legacy `tests/api/*.spec.ts` ported** to hit the gateway — 122 specs must pass identically | `tests/api/` | before any route flag flips to `service` |
| E2E | Playwright (legacy `tests/e2e` ported, 11 specs) against compose stack | `tests/e2e/` | nightly + release |
| Load | k6 scripts for `/widgets/data`, `/ingest/v1/positions` | `tests/load/` | release candidates |

## Git & release

- Trunk-based; short-lived branches `feat/<svc>-<topic>`; Conventional Commits scoped by package (`feat(fleet-metrics): …`); Changesets for versioned packages.
- Each service image tagged `<svc>:<gitsha>` and `<svc>:<semver>`; Helm values pin per-service tags; CD promotes dev → staging → prod with the same chart.

## CI workflows

**`ci.yml`** (PR + main): checkout → pnpm install (frozen) → `turbo run typecheck lint test --filter=...[origin/main]` → `turbo run test:int` for affected services (services start Testcontainers) → OpenAPI/JSON-Schema breaking-change check → build affected Docker images (no push on PR).

**`release.yml`** (tag or main merge): build + push affected images to registry → Trivy → cosign sign → update `deploy/helm/fleetai/values-dev.yaml` tags (PR by bot).

**`deploy.yml`** (manual/environment): `helm upgrade --install fleetai deploy/helm/fleetai -f values-<env>.yaml` → pre-upgrade migration Jobs per service (`prisma migrate deploy`) → rollout wait → smoke (`/ready` of every service, gateway `/api/health` aggregate) → run `tests/api` against the environment.

## Definition of Done for any agent task

1. `pnpm turbo typecheck lint test --filter=<pkg>` green.
2. Integration tests green with real containers (no mocks of PG/Kafka/Redis).
3. OpenAPI / event schemas updated and non-breaking (or ADR added).
4. `README.md` of the package updated; `CHANGELOG` via changeset.
5. Audit decorator on every mutating endpoint; permission guard on every non-public endpoint.
6. No secrets, no absolute paths, no `console.log`.
