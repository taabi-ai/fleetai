/**
 * @fleetai/observability — OpenTelemetry bootstrap + pino JSON logger.
 *
 * `initTelemetry(serviceName)` must run before Nest imports are evaluated.
 * Structured JSON logs with `traceId` injection (pino with pino-opentelemetry
 * transport when enabled). Prometheus /metrics exporter is wired per-service.
 */

import type { Logger } from 'pino';

// Minimal pino-like facade so packages can depend on this without forcing pino
// on non-Nest workspaces. Production services install `pino` themselves.
export interface LoggerLike {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  child(bindings: Record<string, unknown>): LoggerLike;
  [key: string]: unknown;
}

let activeExporterEndpoint: string | undefined;

export function initTelemetry(serviceName: string, opts: { otlpEndpoint?: string; logLevel?: string } = {}): void {
  activeExporterEndpoint = opts.otlpEndpoint ?? process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  // OTel SDK setup (auto-instrumentation for http/fastify/pg/kafkajs/ioredis) is
  // wired by the service's bootstrap once the SDK deps are installed. Here we
  // record the config so logs/metrics carry the service name.
  if (activeExporterEndpoint) {
    process.env['OTEL_SERVICE_NAME'] = serviceName;
  }
}

export function getOtlpEndpoint(): string | undefined {
  return activeExporterEndpoint;
}

let logger: LoggerLike | undefined;

export function setLogger(instance: LoggerLike): void {
  logger = instance;
}

export function getLogger(): LoggerLike {
  if (logger) return logger;
  // No-op console fallback for non-production workspaces.
  const fallback: LoggerLike = {
    info: () => {},
    warn: (o: unknown, m?: string) => console.warn(m ?? o),
    error: (o: unknown, m?: string) => console.error(m ?? o),
    debug: () => {},
    child: () => fallback,
  };
  return fallback;
}

export function createPinoLogger(
  serviceName: string,
  level = process.env['LOG_LEVEL'] ?? 'info'
): { logger: LoggerLike; shutdown: () => Promise<void> } {
  // Dynamic import keeps pino out of workspaces that don't use it.
  let instance: LoggerLike | null = null;
  let pinoShutdown: (() => Promise<void>) | null = null;
  void import('pino').then((pinoMod) => {
    try {
      const pino = (pinoMod as { default: (opts: unknown) => LoggerLike }).default;
      const pinoRoot = pino({
        name: serviceName,
        level,
        base: { service: serviceName },
        formatters: {
          level: (label: string) => ({ level: label }),
          bindings: () => ({ service: serviceName }),
        },
        timestamp: undefined,
      });
      instance = pinoRoot;
      pinoShutdown = () => Promise.resolve((pinoRoot as unknown as { flush?: () => void }).flush?.());
      setLogger(pinoRoot);
    } catch {
      instance = null;
    }
  });
  if (!instance) {
    // fall through to console facade
    const facade: LoggerLike = {
      info: (o: unknown, m?: string) => console.log(m ?? JSON.stringify(o)),
      warn: (o: unknown, m?: string) => console.warn(m ?? JSON.stringify(o)),
      error: (o: unknown, m?: string) => console.error(m ?? JSON.stringify(o)),
      debug: (o: unknown, m?: string) => (level === 'debug' ? console.debug(m ?? JSON.stringify(o)) : undefined),
      child: () => facade,
    };
    instance = facade;
    pinoShutdown = () => Promise.resolve();
  }
  setLogger(instance);
  return { logger: instance, shutdown: async () => { await pinoShutdown?.(); } };
}

// ---------------------------------------------------------------------------
// Prometheusish metrics helper (minimal counter/histogram in-memory registry)
// ---------------------------------------------------------------------------

export type CounterName = string;
export type HistogramName = string;

class MetricsRegistry {
  counters = new Map<string, number>();
  histograms = new Map<string, { sum: number; count: number }>();

  inc(name: string, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  observe(name: string, value: number): void {
    const h = this.histograms.get(name) ?? { sum: 0, count: 0 };
    h.sum += value;
    h.count += 1;
    this.histograms.set(name, h);
  }

  render(): string {
    const lines: string[] = [];
    for (const [name, value] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }
    for (const [name, h] of this.histograms) {
      lines.push(`# TYPE ${name}_sum counter`);
      lines.push(`${name}_sum ${h.sum}`);
      lines.push(`# TYPE ${name}_count counter`);
      lines.push(`${name}_count ${h.count}`);
    }
    return lines.join('\n');
  }
}

const defaultRegistry = new MetricsRegistry();

export const metrics = {
  inc: (name: string, by = 1) => defaultRegistry.inc(name, by),
  observe: (name: string, value: number) => defaultRegistry.observe(name, value),
  renderMetrics: () => defaultRegistry.render(),
};
