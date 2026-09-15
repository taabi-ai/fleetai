# Runbook: Ingest latency

| Field | Value |
|-------|-------|
| Alert | `IngestP95High` |
| Severity | ticket |
| Dashboards | Platform Overview |
| Service | ingest-api |

## Meaning
p95 latency of `/ingest/v1/*` exceeded 200 ms.

## First checks
1. Ingest throughput dashboard — is the producer queue backing up (429s)?
2. Is Redpanda healthy?
3. Is the fleet-metrics consumer keeping up (consumer lag)?

## Remediation
- Scale ingest-api pods (it's stateless).
- Check backpressure: producer queue threshold rejecting with 429 is normal —
  the alert is about latency, not rejects.
- If Redpanda disk is saturated, increase retention window or add partitions.

## Confirmation
p95 under 200 ms for 3 windows.
