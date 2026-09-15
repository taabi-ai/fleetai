# Runbook: Consumer lag

| Field | Value |
|-------|-------|
| Alert | `ConsumerLagHigh` (max lag across groups > 60 s) |
| Severity | ticket |
| Dashboards | Kafka / Outbox → Consumer lag by group |
| Service | the lagging consumer group's service |

## Meaning
A Kafka consumer is not keeping up with the rate events are produced.

## First checks
1. Grafana → Kafka/Outbox: which group lags? Which topic?
2. Is the consumer pod scaled down (KEDA) or crash-looping?
3. Is the consumer blocked on a slow dependency (DB, e-mail, external API)?

## Remediation
- KEDA: check the ScaledObject threshold and topic lag metrics.
- Poison messages: check `<group>.dlq`; redrive after fixing the handler.
- Idempotency table growing? Check `processed_events` retention.

## Confirmation
Lag below 60 s for 3 consecutive evaluation windows.
