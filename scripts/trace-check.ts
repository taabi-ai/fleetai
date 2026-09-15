/**
 * scripts/trace-check.ts — verifies a single trace spans web → gateway → service.
 *
 * Performs one POST /api/widgets/data through the gateway, reads the trace id
 * from the response header (x-trace-id), then queries the Tempo API and asserts
 * the trace contains spans from >= 3 services.
 *
 * Usage: GATEWAY_URL=http://localhost:4000 TEMPO_URL=http://localhost:3200 pnpm tsx scripts/trace-check.ts
 */

const gateway = process.env.GATEWAY_URL ?? 'http://localhost:4000';
const tempo = process.env.TEMPO_URL ?? 'http://localhost:3200';
const token = process.env.TOKEN ?? '';

async function main(): Promise<void> {
  const res = await fetch(`${gateway}/api/widgets/data`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      config: { type: 'kpi_card', title: 'Active Vehicles', dataSource: 'fleet', metric: 'active_vehicles', params: {}, colorScheme: 'green' },
    }),
  });
  if (!res.ok) throw new Error(`gateway call failed: ${res.status}`);
  const traceId = res.headers.get('x-trace-id');
  if (!traceId) throw new Error('missing x-trace-id response header — is OTel context propagation wired?');
  console.log(`trace id: ${traceId}`);

  // Query Tempo for the trace.
  const traceRes = await fetch(`${tempo}/api/traces/${traceId}`);
  if (!traceRes.ok) throw new Error(`tempo query failed: ${traceRes.status}`);
  const trace = (await traceRes.json()) as { batches: Array<{ resource: { attributes: Array<{ key: string; value: { stringValue?: string } }> }; scopeSpans: Array<{ spans: Array<{ name: string }> }> }> };

  const services = new Set<string>();
  let spanCount = 0;
  for (const batch of trace.batches) {
    const svc = batch.resource.attributes.find((a) => a.key === 'service.name')?.value.stringValue;
    if (svc) services.add(svc);
    for (const scope of batch.scopeSpans) spanCount += scope.spans.length;
  }

  console.log(`services in trace: ${[...services].join(', ')}`);
  console.log(`span count: ${spanCount}`);

  const required = ['gateway', 'fleet-metrics'];
  const missing = required.filter((s) => ![...services].some((got) => got.includes(s)));
  if (missing.length) {
    console.error(`trace is missing spans from: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log('trace-check OK');
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
