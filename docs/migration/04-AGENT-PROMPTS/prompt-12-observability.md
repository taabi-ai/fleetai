# Prompt 12 — Observability: tracing, metrics, logs, dashboards, alerts, SLOs

**Branch:** `feat/12-observability`  
**Depends on:** at least 00, 01, 04, 10 merged (more services = more coverage). Parallel-safe with 13.  
**Phase:** 9

## Role

You make the distributed system debuggable. `@fleetai/observability` already instruments every
process; here you wire the backends, build dashboards, define SLOs and alert rules, and prove a
single trace spans web → gateway → service → Kafka → consumer.

## Read first

1. `AGENTS.md`
2. `docs/migration/01-TARGET-ARCHITECTURE/06-security-observability.md` § Observability (signal list, mandatory labels, alert list)
3. `docs/migration/01-TARGET-ARCHITECTURE/05-infra-components.md` (otel-lgtm in dev; Grafana stack / managed alternatives in prod)
4. `packages/observability/README.md` (what is already emitted)
5. Legacy: `legacy/fleetai_dash/nextjs_space/lib/integrations.ts` (New Relic entry — keep New Relic **browser RUM** optional; backend telemetry is OTel and can be exported to New Relic via OTLP if the integration is enabled)

## Deliverables

1. `infra/otel/otel-collector.yaml` finalised: receivers OTLP grpc/http; processors batch, memory_limiter, `resource` (add `deployment.environment`), tail-sampling (keep errors + slow > 1 s + 10 % baseline); exporters → Tempo/Prometheus/Loki (dev: `grafana/otel-lgtm`), optional `otlphttp/newrelic` exporter enabled by env.
2. Kafka context propagation verified: `traceparent` in event envelope (from `@fleetai/events`) is consumed and linked as parent span in `IdempotentConsumer`. Add a test in `packages/events` proving the span link.
3. Grafana dashboards as JSON in `infra/grafana/dashboards/`: *Platform overview* (RPS/latency/error % per service via gateway), *Service detail* (templated by service), *Kafka* (consumer lag per group, DLQ rate, outbox backlog), *Postgres* (connections vs max, slow queries, hypertable chunk stats for fleet_metrics), *Ingest* (positions/s, reject rate, p95), *Gateway shadow diffs*. Provisioning config so they load on `pnpm infra:up`.
4. Prometheus rules `infra/prometheus/rules.yaml`: SLOs — gateway availability 99.9 %, p95 < 500 ms read routes, ingest p95 < 200 ms, consumer lag < 60 s, outbox oldest unsent < 30 s, DLQ > 0 in 10 min, DB connections > 80 % max, pod restarts, certificate expiry. Multi-window burn-rate alerts for the availability SLO.
5. Log conventions enforced: pino JSON with `service, env, traceId, spanId, userId (hashed), route`; redaction list (authorization, cookie, password, token, apiKey, secret); a lint test in `@fleetai/observability` that fails if redaction paths are removed.
6. Runbook docs `docs/runbooks/*.md` for each alert (what it means, first checks, dashboards, remediation).
7. Synthetic probe: k6 or Playwright smoke run every 5 min in CI schedule (`.github/workflows/synthetic.yml`) hitting gateway health + one dashboard read; posts result as Prometheus pushgateway metric or GitHub status.
8. Verification script `scripts/trace-check.ts`: performs one `POST /api/widgets/data` through the gateway, then queries Tempo API for the trace id from the response header and asserts it contains spans from `gateway`, `dashboard`/`fleet-metrics`, and (if an audited write is used) `platform-config` consumer.

## Steps

1. Collector config + LGTM in compose; confirm spans arrive.
2. Kafka propagation test.
3. Dashboards (start from Grafana community JSON for Kafka/Postgres, adapt labels).
4. Rules + runbooks.
5. Synthetic workflow; trace-check script.

## Acceptance

```bash
pnpm infra:up && curl -sf localhost:3001/api/health     # Grafana up (adjust port from compose)
pnpm --filter @fleetai/observability test
pnpm tsx scripts/trace-check.ts                          # prints span list incl. >= 3 services
curl -s localhost:9090/api/v1/rules | jq '.data.groups | length'   # > 0
```

## Do not

* Do not log request bodies or tokens.
* Do not add vendor agents (New Relic APM agent, Datadog) inside services — export OTLP instead.
* Do not set 100 % trace sampling in prod configs.

## Completion report

```
## Prompt 12 report
Signals verified end-to-end (trace id, services in trace)
Dashboards / rules / runbooks counts
Acceptance output
Deviations / open questions
```
