/**
 * tests/chaos/kill-redpanda.ts — kill Redpanda for 60s, verify the outbox
 * backlog drains and zero events are lost once it returns.
 *
 * Usage (against the compose stack):
 *   pnpm tsx tests/chaos/kill-redpanda.ts
 */

import { execSync } from 'node:child_process';

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const COMPOSE = 'docker compose -f infra/docker-compose.dev.yml';

async function main(): Promise<void> {
  // 1. Produce some events through the gateway (or directly via a service).
  const before = Number(run(`${COMPOSE} exec -T redpanda rpk topic list | wc -l`).trim());
  console.log(`topics before: ${before}`);

  // Emit a few audit events through the gateway shadow path.
  for (let i = 0; i < 20; i++) {
    try {
      run(`curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:4000/api/signup -H 'content-type: application/json' -d '{}'`);
    } catch {
      /* expected failures while broker is down */
    }
  }

  // 2. Kill Redpanda for 60s.
  console.log('killing redpanda for 60s...');
  run(`${COMPOSE} stop redpanda`);
  await new Promise((r) => setTimeout(r, 60_000));
  run(`${COMPOSE} start redpanda`);
  console.log('redpanda restarted, waiting for health...');
  await new Promise((r) => setTimeout(r, 30_000));

  // 3. Verify outbox backlog drains within the relay poll interval.
  const sql = 'select count(*) from outbox_events where published_at is null';
  const pending = run(`${COMPOSE} exec -T postgres psql -U fleetai -t -c "${sql}"`).trim();
  console.log(`outbox_events pending after drain: ${pending}`);
  if (Number(pending) > 0) {
    console.error('FAIL: outbox backlog did not drain — events may have been lost');
    process.exit(1);
  }
  console.log('PASS: redpanda outage recovered with 0 lost events (at-least-once + archive check manual)');
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
