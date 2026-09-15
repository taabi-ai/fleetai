# Runbook: Dead-letter queue

| Field | Value |
|-------|-------|
| Alert | `DlqMessages` (DLQ received messages in 10 min) |
| Severity | ticket |
| Dashboards | Kafka / Outbox → DLQ messages |
| Service | consumer group named in topic |

## Meaning
A consumer exhausted its retries and parked a message on `<group>.dlq`.

## First checks
1. Which topic? `rpk topic consume <group>.dlq --offset -10`
2. Read the error payload in the DLQ message.
3. Is it a schema/version mismatch, a bug, or a transient dependency failure?

## Remediation
- Fix the handler for the failing case.
- Redrive from DLQ (re-send the original payload to its topic, delete from DLQ).

## Confirmation
No new DLQ messages in 30 minutes.
