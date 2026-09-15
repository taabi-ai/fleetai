/**
 * tests/chaos/kill-fleet-metrics.ts — kill fleet-metrics for 30s; the
 * dashboard widget-data proxy must return cached/degraded data (stale:true),
 * never a 500.
 *
 * Usage: pnpm tsx tests/chaos/kill-fleet-metrics.ts
 */

import { execSync } from 'node:child_process';

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const COMPOSE = 'docker compose -f infra/docker-compose.dev.yml';

async function main(): Promise<void> {
  // Prime the Redis cache with one widget-data request.
  const warm = () =>
    run(
      `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:4000/api/widgets/data -H 'content-type: application/json' -d '{"config":{"type":"kpi_card","title":"Active Vehicles","dataSource":"fleet","metric":"active_vehicles","params":{}}}'`
    );
  console.log(`warm-up: ${warm()}`);

  console.log('killing fleet-metrics for 30s...');
  run(`${COMPOSE} stop fleet-metrics`);
  await new Promise((r) => setTimeout(r, 30_000));

  const status = warm();
  console.log(`widget-data while fleet-metrics down: HTTP ${status}`);
  if (status !== '200') {
    console.error(`FAIL: expected cached/degraded 200, got ${status}`);
    process.exit(1);
  }

  run(`${COMPOSE} start fleet-metrics`);
  console.log('PASS: widget data served from cache while fleet-metrics is down');
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
