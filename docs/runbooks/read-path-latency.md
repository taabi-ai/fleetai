# Runbook: Read-path latency

| Field | Value |
|-------|-------|
| Alert | `ReadPathP95High` |
| Severity | ticket |
| Dashboards | Platform Overview → p95 latency per service |
| Service | gateway |

## Meaning
p95 latency on `/api/widgets/data` or `/api/dashboard*` exceeded 500 ms.

## First checks
1. Which route? Grafana latency by route.
2. Redis cache hit ratio on `/api/widgets/data` — is the cache warm?
3. Is `fleet-metrics` slow (hypertable scans) or the weather API?
4. Database slow queries dashboard.

## Remediation
- Warm the Redis widget-data cache.
- Scale fleet-metrics or fix a slow hypertable query (add index/partition).
- Check for upstream timeouts from the weather provider.

## Confirmation
p95 under 500 ms for 3 windows (10 min each).
