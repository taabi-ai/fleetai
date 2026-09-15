import { describe, it, expect } from 'vitest';
import { buildServer } from '../../src/main.ts';

describe('service template', () => {
  it('serves /health/live', async () => {
    const server = buildServer();
    const res = await server.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    await server.close();
  });

  it('serves /health/ready when dependencies are up', async () => {
    const server = buildServer();
    const res = await server.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
    await server.close();
  });
});
