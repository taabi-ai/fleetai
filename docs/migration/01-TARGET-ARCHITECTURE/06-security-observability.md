# 06 · Security & observability

## AuthN/AuthZ

- **identity** service issues **RS256 access tokens (15 min)** + **refresh tokens (30 d, rotating, stored hashed)**. Claims: `sub, email, name, role, permissions[], ver` (token version for revocation), `iss=https://<host>/auth`, `aud=fleetai`.
- **JWKS** at `/.well-known/jwks.json`; key rotation every 90 d with 2 active kids. Every service verifies offline with `jose`; no introspection calls.
- **Gateway** verifies signature + checks Redis deny-list `revoked:{sub}:{ver}`; forwards `Authorization` unchanged plus `x-fleetai-user` (JSON of sub/role/permissions) as a **signed internal header** (HMAC with `INTERNAL_HEADER_SECRET`) so services can trust it without re-verifying when they choose to.
- Services enforce permissions with the same catalog as the monolith (`lib/rbac.ts` → `packages/auth/permissions.ts`). Permission strings are **unchanged** so existing role rows migrate as-is.
- Web app keeps the login UI; Auth.js is replaced by a thin session cookie (httpOnly, SameSite=Lax) holding the refresh token; access token kept in memory and refreshed via gateway `/auth/refresh`.
- Service-to-service calls (rare, e.g. dashboard → identity backfill) use **client-credentials JWT** minted by identity for service principals, `aud=<service>`.
- **ingest-api** authenticates devices/TSPs with per-tenant API keys (hashed in `IngestKey`, rotated via admin UI), rate-limited per key.

## Secrets & config

- No secrets in git. Dev: `.env` per service from `.env.example`. Prod: External Secrets Operator.
- `platform-config` remains the **runtime override store** (the monolith's `EnvVar` semantics): non-secret keys can be overridden from the admin UI; secret keys are write-only and stored encrypted (`pgcrypto`, key from env). Services fetch `/config/resolve?keys=...` at boot and on `config.changed`.

## Network

- Only `web`, `gateway`, `ingest-api` have Ingress. All other services are ClusterIP; NetworkPolicies allow ingress only from gateway (HTTP) and from the OTel collector (metrics).
- Redpanda/Redis/PostgreSQL: no public exposure; TLS in transit in prod (managed services provide this).

## Audit (non-negotiable, inherited from monolith)

- Every mutating handler in every service is wrapped by `@Audited(entity, verb)` decorator from `@fleetai/audit` which publishes `fleetai.audit.recorded` through the outbox with `{actor, entity, entityId, verb, before?, after?, ip, ua}`.
- platform-config's audit consumer persists to `AuditLog` (append-only, monthly partitions, 400-day retention). Admin UI `/admin/audit` is unchanged.

## Observability

- **Traces:** OpenTelemetry auto-instrumentation (`@opentelemetry/auto-instrumentations-node`) + manual spans in consumers; `traceId` propagated in Kafka headers and event envelope.
- **Metrics:** Prometheus exporter per service (`/metrics`, not exposed via ingress). Mandatory: `http_server_duration`, `kafka_consumer_lag`, `pgmq_queue_depth{queue}`, `outbox_pending`, `llm_tokens_total{provider,model}`, `widget_data_cache_hit_ratio`.
- **Logs:** pino JSON → stdout → Loki/New Relic. Never log tokens, passwords, presigned URLs.
- **Dashboards & alerts** (Grafana JSON in `deploy/observability/`): consumer lag > 5 k for 5 min, DLQ non-empty, outbox pending > 100 for 2 min, p95 `/widgets/data` > 800 ms, 5xx ratio > 1%.
- **New Relic** stays optional: the monolith's RUM integration moves to `apps/web`; server-side export goes through the OTel collector's New Relic exporter when `NEW_RELIC_LICENSE_KEY` is set.

## Supply chain

- `pnpm audit --prod` in CI (fail on high), Renovate for deps, Trivy scan of images, SBOM (syft) attached to releases, images signed with cosign, non-root distroless-ish runtime (`node:22-bookworm-slim`, uid 1001, as the monolith Dockerfile already does).
