// tests/load/dashboard-read.js — mixed dashboard + widget data reads.
// Target: p95 < 800ms at 200 RPS sustained (scalability assessment baseline),
// 0% errors. Thresholds are encoded; do NOT lower them to make tests pass.

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    read: {
      executor: 'constant-arrival-rate',
      rate: 200,                 // requests per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 8,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:widgets_data}': ['p(95)<800'],
    'http_req_duration{name:dashboard_view}': ['p(95)<800'],
  },
};

const GATEWAY = __ENV.GATEWAY_URL ?? 'http://localhost:4000';
const TOKEN = __ENV.TOKEN ?? ''; // synthetic test token; leave empty in CI smoke

const headers = {
  'content-type': 'application/json',
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
};

export default function () {
  if (__ITER % 5 === 0) {
    // 1 in 5 requests is a dashboard view
    const res = http.get(`${GATEWAY}/api/dashboard`, { headers, tags: { name: 'dashboard_view' } });
    check(res, { 'dashboard 200': (r) => r.status === 200 });
  } else {
    const res = http.post(
      `${GATEWAY}/api/widgets/data`,
      JSON.stringify({
        config: { type: 'kpi_card', title: 'Active Vehicles', dataSource: 'fleet', metric: 'active_vehicles', params: {}, colorScheme: 'green' },
      }),
      { headers, tags: { name: 'widgets_data' } }
    );
    check(res, { 'widget data 200': (r) => r.status === 200 });
  }
  sleep(0.1);
}
