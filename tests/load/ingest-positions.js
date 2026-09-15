// tests/load/ingest-positions.js — telemetry ingest at high throughput.
// Target: 10,000 positions/s sustained, p95 < 200ms, 0 errors.
// Run against the compose stack, not against production.

import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    ingest: {
      executor: 'constant-arrival-rate',
      rate: 10000,               // positions per second
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const INGEST = __ENV.INGEST_URL ?? 'http://localhost:4013';
const KEY = __ENV.INGEST_KEY ?? 'dev-ingest-key';

const headers = { 'content-type': 'application/json', 'x-ingest-key': KEY };

export default function () {
  const payload = Array.from({ length: 50 }, (_, i) => ({
    vehicleId: `V-${String((__VU * 37 + i) % 180).padStart(4, '0')}`,
    ts: new Date(Date.now() - (__ITER % 90) * 60000).toISOString(),
    lat: 19.07 + (__ITER % 100) * 0.001,
    lng: 72.87 - (__ITER % 100) * 0.001,
    speed: (__ITER % 90) + 10,
    heading: (__ITER * 17) % 360,
    odometer: 100000 + __ITER * 1.2,
    soc: 40 + (__ITER % 60),
    fuelPct: 30 + (__ITER % 70),
    source: 'tsp',
  }));
  const res = http.post(`${INGEST}/ingest/v1/positions`, JSON.stringify(payload), { headers });
  check(res, { 'ingest 202': (r) => r.status === 202 });
}
