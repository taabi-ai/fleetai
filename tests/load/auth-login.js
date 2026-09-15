// tests/load/auth-login.js — bcrypt cost sanity + login throughput.
// Target: p95 < 500ms at 10 logins/s with the production bcrypt cost.

import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    login: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 4,
      maxVUs: 20,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

const GATEWAY = __ENV.GATEWAY_URL ?? 'http://localhost:4000';
const EMAIL = __ENV.SEED_EMAIL ?? 'admin@fleetai.local';
const PASSWORD = __ENV.SEED_PASSWORD ?? 'test-password-placeholder';

export default function () {
  const res = http.post(
    `${GATEWAY}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'content-type': 'application/json' } }
  );
  check(res, { 'login ok or 401': (r) => r.status === 200 || r.status === 401 });
}
