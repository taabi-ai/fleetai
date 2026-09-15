# Prompt 13 — Helm charts, Kubernetes, KEDA autoscaling, GitOps

**Branch:** `feat/13-helm-k8s-keda`  
**Depends on:** 00, 01, 10, 11 merged; run a *partial* pass after 04 (deploy gateway+web+fleet-metrics+ingest) and the full pass in Phase 9.  
**Phase:** 3 (partial) / 9 (full)

## Role

You replace the monolith's single-Deployment manifests (`legacy/.../k8s/*.yaml` — one container,
HPA 2→6 on CPU) with an umbrella Helm chart that deploys 12 deployables independently, scales
consumers on Kafka lag with KEDA, runs migrations as Jobs, and is applied by Argo CD (or Flux).

## Read first

1. `AGENTS.md`
2. `docs/migration/01-TARGET-ARCHITECTURE/05-infra-components.md` (sizing table, Azure/AWS mapping)
3. `docs/migration/01-TARGET-ARCHITECTURE/06-security-observability.md` (network policies, secrets)
4. `docs/migration/06-REFERENCE/04-env-var-matrix.md` (every env var per deployable → values/secrets)
5. `docs/migration/05-TEMPLATES/helm-values.example.yaml`
6. Legacy: `legacy/fleetai_dash/nextjs_space/k8s/*.yaml` (ingress host/TLS annotations, probe paths, secret names — reuse naming), `Dockerfile`, `docker-compose.yml`, `DEPLOYMENT.md` §5b

## Deliverables

1. `deploy/helm/fleetai-platform/` umbrella chart with a generic library sub-chart `deploy/helm/charts/fleetai-service/` (Deployment, Service, HPA/KEDA ScaledObject, PDB, ServiceAccount, ConfigMap, ExternalSecret or Secret ref, NetworkPolicy, ServiceMonitor, migration Job hook `pre-upgrade` running `prisma migrate deploy`) and one values file per deployable (web, gateway, ingest-api, identity, dashboard, fleet-metrics, ai, platform-config, notification, media, training, engineering).
2. Scaling policy:
   * HTTP apps: HPA on CPU 70 % **and** requests/s (Prometheus adapter or KEDA prometheus scaler) — min/max from sizing table.
   * Consumers (fleet-metrics ingest consumer, notification, platform-config audit consumer): **KEDA `kafka` scaler** on consumer-group lag (`lagThreshold: 1000`, `activationLagThreshold: 100`), scale to zero allowed for notification only.
   * Job workers (ai async, email): KEDA `postgresql` scaler on pgmq queue depth.
3. Ingress: single host (reuse legacy host + TLS annotations) → `/` → web, `/api` → gateway, `/ingest` → ingest-api; rate-limit annotations for `/ingest`.
4. Secrets: External Secrets Operator manifests (Azure Key Vault / AWS Secrets Manager providers) with a fallback `kubectl create secret` script for clusters without ESO; **no secret values in the repo**.
5. Network policies: default deny; allow gateway→services, services→postgres/redpanda/redis/minio, ingest→redpanda, all→otel-collector.
6. Environments: `values-dev.yaml`, `values-staging.yaml`, `values-prod.yaml`; `deploy/argocd/applicationset.yaml` (or Flux Kustomizations) pointing at the chart per env.
7. Stateful dependencies: document (not deploy) managed options; provide optional sub-charts for dev clusters only (`bitnami/postgresql` w/ timescale image, `redpanda/redpanda`, `bitnami/redis`, `minio/minio`) behind `devDependencies.enabled`.
8. CI: `.github/workflows/deploy.yml` — build+push images per changed workspace (Turborepo `--filter=...[origin/main]`), `helm lint`, `helm template | kubeconform`, `kind` cluster smoke deploy of gateway+web+fleet-metrics with health checks.
9. `docs/deploy/README.md`: bootstrap a cluster from zero (AKS and EKS variants), day-2 ops (rollback, scale, rotate secrets, run a migration Job manually).

## Steps

1. Library chart + one service values → `helm template` clean → kind deploy.
2. All values files; KEDA objects; ingress; policies.
3. ESO + env values; ArgoCD/Flux.
4. CI + docs.

## Acceptance

```bash
helm lint deploy/helm/fleetai-platform
helm template fleetai deploy/helm/fleetai-platform -f deploy/helm/fleetai-platform/values-dev.yaml | kubeconform -strict -ignore-missing-schemas
kind create cluster --name fleetai-ci && helm install fleetai deploy/helm/fleetai-platform -f values-dev.yaml --set devDependencies.enabled=true --wait --timeout 10m
kubectl get scaledobjects -A | wc -l          # >= 3
kubectl get pods -n fleetai | grep -c Running  # == number of enabled deployables + deps
```

## Do not

* Do not commit secret values or kubeconfigs.
* Do not run database migrations from application containers at startup (Job hook only).
* Do not put all services in one Deployment/pod.

## Completion report

```
## Prompt 13 report
Charts/values files ; ScaledObjects ; NetworkPolicies
kind smoke result (pods running, health checks)
Acceptance output
Deviations / open questions
```
