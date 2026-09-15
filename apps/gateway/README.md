# @fleetai/gateway

Fastify API gateway — the strangler-fig facade that lets the platform migrate
route-by-route from the legacy monolith.

## How it works

`routes.yaml` declares every legacy `/api/*` route with a flag:

| Flag | Behaviour |
|------|-----------|
| `legacy` | Proxy to `LEGACY_URL` (the running monolith) |
| `shadow` | Proxy to legacy **and** asynchronously replay to the owning service; status/body diffs are logged (`gateway_shadow_mismatch_total`) |
| `service` | Proxy to the service; adds `x-fleetai-internal` HMAC + `x-fleetai-principal` headers |
| `gateway` | Answered by this app (e.g. `/api/health` aggregate) |

## How to flip a flag

1. Edit `routes.yaml`, or hot-reload (the file is watched every 2 s).
2. Or use the admin endpoint (used by the cutover runbook):

   ```bash
   curl -X PATCH localhost:4000/admin/gateway/routes/api/widgets/data/flag \
     -H 'content-type: application/json' -d '{"flag":"shadow"}'
   ```

3. Watch shadow diffs in the gateway log: `[gateway] shadow mismatch route=...`

## Run

```bash
pnpm --filter @fleetai/gateway start
# env: LEGACY_URL=http://localhost:3001  (default)
```

## Checks

```bash
pnpm --filter @fleetai/gateway check:routes   # routes.yaml == reference map
pnpm --filter @fleetai/gateway test
```
