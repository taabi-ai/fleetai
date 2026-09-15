/**
 * services/_template — hello service that proves the toolchain works.
 * Copy this folder for every new service; the port in config.ts is the only
 * thing that must change (services use 40xx dev ports, see service catalog).
 */

import { config } from './config.js';
import { wireHealth, gracefulShutdown } from '@fleetai/nest-common';
import { initTelemetry } from '@fleetai/observability';
import Fastify, { type FastifyInstance } from 'fastify';

initTelemetry(config.SERVICE_NAME, { otlpEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT });

export function buildServer(): FastifyInstance {
  const server = Fastify({ logger: { level: config.LOG_LEVEL } });

  wireHealth(server as never, {
    name: config.SERVICE_NAME,
    port: config.PORT,
    version: '0.1.0',
    readinessChecks: [
      // Template has no DB/Kafka/Redis yet — add checks here in real services.
      async () => null,
    ],
  });

  server.get('/', async () => ({
    service: config.SERVICE_NAME,
    version: '0.1.0',
    docs: '/health/live',
  }));

  return server;
}

async function main(): Promise<void> {
  const server = buildServer();
  await server.listen({ port: config.PORT, host: '0.0.0.0' });
  gracefulShutdown(server as never);
}

// Only start when run directly (not when imported by tests).
if (process.argv[1]?.endsWith('main.ts') || process.argv[1]?.endsWith('main.js')) {
  void main();
}

export { config };
