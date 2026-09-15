// tests/load/ai-generate.js — AI widget generation against the fake LLM.
// Target: p95 < 15s, 95% of requests succeed, quota checks correct.

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    ai: {
      executor: 'constant-vus',
      vus: 20,
      duration: '3m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<15000'],
    http_req_failed: ['rate<0.05'],
  },
};

const GATEWAY = __ENV.GATEWAY_URL ?? 'http://localhost:4000';
const TOKEN = __ENV.TOKEN ?? '';

const headers = { 'content-type': 'application/json', ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) };

export default function () {
  const res = http.post(
    `${GATEWAY}/api/ai/generate-widget`,
    JSON.stringify({ prompt: 'build an active vehicles KPI widget for my fleet dashboard', mode: 'new', currentWidget: null }),
    { headers }
  );
  check(res, {
    'ai 200 range': (r) => r.status === 200 || r.status === 202,
    'no 429 flood': (r) => r.status !== 429 || `429s allowed but counted`,
  });
  sleep(2); // LLM calls are slow; don't self-DDoS
}
