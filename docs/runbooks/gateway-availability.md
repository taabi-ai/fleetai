# Runbook: Gateway availability

| Field | Value |
|-------|-------|
| Alert | `GatewayAvailabilityPageBurn` / `GatewayAvailabilityTicketBurn` |
| Severity | page (page-rate burn) / ticket |
| Dashboards | Platform Overview → Gateway availability |
| Service | gateway |

## Meaning
The gateway's 5-minute error rate implies an availability burn rate above the
SLO budget (99.9% over 30 days).

## First checks
1. `docker logs fleetai-gateway-1 --tail 500` — upstream 5xx? connection refused?
2. `curl -sf localhost:4000/api/health` — is the gateway itself up? Do the
   `checks` say `legacy: down`?
3. Check per-route error counters: `gateway_shadow_mismatch_total`, upstream timeouts.
4. Which service is failing? Check its `/health/ready`.

## Remediation
- Upstream down → restart that service, check `Event` for OOM (worker) or probe.
- Gateway deploy broke a route → roll back gateway image.
- Increase anonymous rate limit if `429` dominates errors.

## Confirmation
`gateway:availability:5m` returns above 0.999 for 30 minutes.
