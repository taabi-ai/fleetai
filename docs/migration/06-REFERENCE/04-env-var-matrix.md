# 04 · Environment variable matrix

`✓` = required, `○` = optional. Names reuse the monolith's where one exists (see legacy `.env.example`, `lib/env.ts`, `lib/storage.ts`).

| Variable | web | gateway | identity | dashboard | fleet-metrics | ingest-api | ai | platform-config | notification | media | training | engineering |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `NODE_ENV`, `PORT`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `LOG_LEVEL` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `DATABASE_URL` (own DB) | | | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `LEGACY_DATABASE_URL` (backfill only, read-only role) | | | ○ | ○ | ○ | | ○ | ○ | ○ | ○ | ○ | ○ |
| `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_SASL_MECHANISM/USERNAME/PASSWORD` (prod) | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `REDIS_URL` | | ✓ | ○ | ○ | ✓ | ○ | ✓ | ✓ | ○ | | | ○ |
| `GATEWAY_URL` (server-side fetches) | ✓ | | | | | | | | | | | |
| `NEXT_PUBLIC_APP_URL` | ✓ | | | | | | | | | | | |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `JWKS_URL` | | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `JWT_PRIVATE_KEY_PEM` (or KMS ref), `JWT_KID` | | | ✓ | | | | | | | | | |
| `REFRESH_TOKEN_TTL_DAYS`, `ACCESS_TOKEN_TTL_MIN` | | | ✓ | | | | | | | | | |
| `INTERNAL_HEADER_SECRET` | | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ROUTE_identity|dashboard|metrics|ai|config|notify|media|training|eng` = legacy\|shadow\|service | | ✓ | | | | | | | | | | |
| `LEGACY_UPSTREAM_URL` (monolith) | | ✓ | | | | | | | | | | |
| `SVC_<NAME>_URL` (×9) | | ✓ | | | | | | | | | | |
| `RATE_LIMIT_RPM_USER`, `RATE_LIMIT_RPM_IP` | | ✓ | | | | ✓ | | | | | | |
| `WIDGET_CACHE_TTL_SEC` (default 30) | | | | | ✓ | | | | | | | |
| `OPEN_METEO_BASE_URL` | | | | | ✓ | | | | | | | |
| `TIMESCALE_ENABLED` (auto-detect fallback) | | | | | ✓ | | | | | | | |
| `INGEST_MAX_BATCH`, `INGEST_KEY_HASH_SALT` | | | | | ✓ | ✓ | | | | | | |
| `LLM_DEFAULT_PROVIDER_ID`, provider keys (`ABACUSAI_API_KEY` / `OPENAI_API_KEY` … as configured in LlmProvider rows) | | | | | | | ✓ | | | | | |
| `AI_JOB_TIMEOUT_SEC` (120), `AI_WORKER_CONCURRENCY` | | | | | | | ✓ | | | | | |
| `CONFIG_ENCRYPTION_KEY` (pgcrypto for secret EnvVars) | | | | | | | | ✓ | | | | |
| `SMTP_*` fallback (DB `SmtpSetting` wins) | | | | | | | | ○ | ✓ | | | |
| `S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE, S3_PUBLIC_BASE_URL, S3_PREFIX` | | | | | | | | | | ✓ | ○ | |
| `AZURE_STORAGE_CONNECTION_STRING` (alt to S3) | | | | | | | | | | ○ | | |
| `PLANE_API_URL/TOKEN`, `DORA_WEBHOOK_TOKEN`, `CRM_*` (DB IntegrationSetting wins) | | | | | | | | ○ | | | | ✓ |
| `NEW_RELIC_LICENSE_KEY`, `NEW_RELIC_BROWSER_*` | ○ | | | | | | | | | | | |

Rule: every service validates its env with a Zod schema at boot (`@fleetai/config`) and exits non-zero with a clear message if anything required is missing.
