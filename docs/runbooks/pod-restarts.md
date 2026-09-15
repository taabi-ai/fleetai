# Runbook: Pod restarts

| Field | Value |
|-------|-------|
| Alert | `PodRestarts` (> 3 restarts in 15 min) |
| Severity | page |
| Dashboards | Kubernetes |
| Service | pod named in label |

## Meaning
A pod is crash-looping or being killed repeatedly.

## First checks
1. `kubectl describe pod <pod>` — Last State, Reason (OOMKilled? Error?).
2. `kubectl logs <pod> --previous` — the crash message.
3. Memory: worker OOM with `max-old-space-size` — check limits.

## Remediation
- Fix the crash (config missing, DB unreachable, code assertion).
- Raise memory limit if OOMKilled but legitimate growth.

## Confirmation
No restarts in the last 30 minutes.
