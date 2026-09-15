# Runbook: Outbox backlog

| Field | Value |
|-------|-------|
| Alert | `OutboxBacklog` (oldest unsent > 30 s) |
| Severity | ticket |
| Dashboards | Kafka / Outbox → Outbox backlog per service |
| Service | the service named in the label |

## Meaning
A service's `outbox_events` has a row unpublished for longer than 30 s — the
relay is stuck or the Kafka producer is down.

## First checks
1. Which service? Grafana → Outbox backlog per service.
2. Is the service's `OutboxRelay` running (log line `outbox relay`)?
3. `select max(created_at) - now() from outbox_events where published_at is null;`
4. Is Redpanda healthy? `docker exec fleetai-redpanda-1 rpk cluster health`

## Remediation
- Restart the service (relay restarts and picks up pending rows via SKIP LOCKED).
- If Redpanda was down, restart it; the relay publishes on the next poll.

## Confirmation
`fleetai:outbox_oldest_unsent` below 30 s.
