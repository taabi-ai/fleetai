# 05 · Infrastructure components

| Component | Dev (docker-compose.dev.yml) | Prod (Helm / managed) | Used by | Config keys |
|---|---|---|---|---|
| PostgreSQL 17 (+ `pgmq`, `timescaledb` on metrics DB) | `timescale/timescaledb-ha:pg17` single container, 9 databases created by `infra/postgres/init.sql` | Managed (RDS / Azure Flexible Server) **or** CloudNativePG operator; one DB per service, separate roles | all services | `DATABASE_URL` per service |
| Redpanda | `redpandadata/redpanda` single node + Console on :8080 | Redpanda Helm chart (3 brokers) or managed Kafka | producers/consumers, Debezium | `KAFKA_BROKERS`, `KAFKA_CLIENT_ID`, `KAFKA_SASL_*` |
| Redis 7 / Valkey | `redis:7-alpine` | Bitnami Redis chart (replication) or managed (ElastiCache / Azure Cache) | gateway, ai, fleet-metrics, platform-config | `REDIS_URL` |
| MinIO | `minio/minio` + `mc` bucket bootstrap (`fleetai-media`, `fleetai-training`, `fleetai-exports`) | MinIO operator **or** real S3 / Azure Blob (monolith's `lib/storage.ts` already abstracts both) | media, training | `S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE, S3_PUBLIC_BASE_URL` (same names as monolith) |
| Debezium (Phase 3–6 only) | `debezium/connect` pointing at legacy PG | Strimzi/Connect deployment, removed after cut-over | data migration | connector JSON in `infra/debezium/` |
| OpenTelemetry Collector | `otel/opentelemetry-collector-contrib` → Grafana LGTM all-in-one (`grafana/otel-lgtm`) | Grafana Cloud / New Relic (OTLP endpoint) | all | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` |
| KEDA | — | KEDA operator; ScaledObjects on Kafka lag (`fleet-metrics-consumer`) and PostgreSQL query (pgmq depth for `ai-worker`, `notify-worker`) | workers | in Helm values |
| Ingress | — | NGINX/Traefik + cert-manager; only `web` and `gateway` (and `ingest-api`) exposed | — | — |
| Secrets | `.env` files (git-ignored) | External Secrets Operator → AWS Secrets Manager / Azure Key Vault | — | — |

## Sizing starting points (adjust from metrics)

| Deployable | Replicas | CPU req/lim | Mem req/lim | Autoscale on |
|---|---|---|---|---|
| web | 2 | 200m / 1 | 384Mi / 1Gi | CPU 70% |
| gateway | 2 | 200m / 1 | 256Mi / 512Mi | RPS (custom) or CPU |
| identity, dashboard, platform-config, training, media, engineering | 2 each | 100m / 500m | 256Mi / 512Mi | CPU 70% |
| fleet-metrics (api) | 2 | 250m / 1 | 512Mi / 1Gi | CPU |
| fleet-metrics-consumer | 1–10 | 250m / 1 | 512Mi / 1Gi | Kafka lag > 1000 |
| ai (api) | 2 | 100m / 500m | 256Mi / 512Mi | CPU |
| ai-worker | 1–8 | 250m / 1 | 512Mi / 1Gi | pgmq depth > 5 |
| notification-worker | 1–4 | 100m / 500m | 256Mi / 512Mi | pgmq depth > 20 |
| ingest-api | 2–10 | 250m / 1 | 256Mi / 512Mi | CPU / RPS |

## Azure vs AWS mapping

| Need | AWS | Azure |
|---|---|---|
| Kubernetes | EKS | AKS |
| PostgreSQL | RDS for PostgreSQL 17 (Timescale not available → use native partitioning) or self-host CloudNativePG | Azure Database for PostgreSQL Flexible Server (supports `timescaledb` + `pg_cron`; `pgmq` **not** on the allow-list as of 2026 → use the shim from `PGMQ_PLAN.md` Track A or self-host) |
| Kafka | MSK / MSK Serverless or Redpanda Cloud | Event Hubs (Kafka endpoint) or Redpanda Cloud |
| Redis | ElastiCache | Azure Cache for Redis |
| Objects | S3 | Blob Storage (monolith already has `@azure/storage-blob` path) or MinIO on AKS |
| Secrets | Secrets Manager | Key Vault |
| Registry | ECR | ACR |

When a managed PostgreSQL lacks `pgmq`, `@fleetai/queue` must fall back to its SKIP-LOCKED shim automatically (feature-detect `pg_available_extensions` at startup). This is a hard requirement in `prompt-01`.
