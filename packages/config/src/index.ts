/**
 * @fleetai/config — Configuration management with remote override support
 *
 * Provides:
 * - `getEnv(name, options)` — read a single env var with validation
 * - `getEnvMany(names)` — read multiple env vars at once
 * - `defineConfig(schema)` — define a service's config schema with Zod validation
 * - `ConfigProvider` interface with `EnvProvider` + `RemoteOverrideProvider`
 */

import { z, ZodSchema } from 'zod';

export interface ConfigProvider {
  get<T>(key: string, schema: ZodSchema<T>, options?: { required?: boolean; default?: T }): T;
  getMany<T extends Record<string, ZodSchema>>(schema: T): { [K in keyof T]: z.infer<T[K]> };
}

export interface RemoteOverrideProvider {
  getOverrides(service: string): Promise<Record<string, unknown>>;
}

class EnvProvider implements ConfigProvider {
  private overrides: Map<string, unknown> = new Map();

  setOverride(key: string, value: unknown): void {
    this.overrides.set(key, value);
  }

  get<T>(key: string, schema: ZodSchema<T>, options?: { required?: boolean; default?: T }): T {
    // Check overrides first
    if (this.overrides.has(key)) {
      const value = this.overrides.get(key);
      return schema.parse(value);
    }

    const rawValue = process.env[key];

    if (rawValue === undefined || rawValue === '') {
      if (options?.required) {
        throw new Error(`Missing required environment variable: ${key}`);
      }
      if (options?.default !== undefined) {
        return schema.parse(options.default);
      }
      throw new Error(`Environment variable ${key} is not set and has no default`);
    }

    try {
      return schema.parse(rawValue);
    } catch (error) {
      throw new Error(`Invalid value for ${key}: ${rawValue}. ${(error as Error).message}`);
    }
  }

  getMany<T extends Record<string, ZodSchema>>(schemas: T): { [K in keyof T]: z.infer<T[K]> } {
    const result = {} as { [K in keyof T]: z.infer<T[K]> };
    for (const [key, schema] of Object.entries(schemas)) {
      result[key as keyof T] = this.get(key, schema as ZodSchema);
    }
    return result;
  }
}

export class RemoteOverrideConfigProvider implements ConfigProvider {
  constructor(
    private envProvider: EnvProvider,
    private remoteProvider: RemoteOverrideProvider,
    private serviceName: string
  ) {}

  async refreshOverrides(): Promise<void> {
    const overrides = await this.remoteProvider.getOverrides(this.serviceName);
    for (const [key, value] of Object.entries(overrides)) {
      this.envProvider.setOverride(key, value);
    }
  }

  get<T>(key: string, schema: ZodSchema<T>, options?: { required?: boolean; default?: T }): T {
    return this.envProvider.get(key, schema, options);
  }

  getMany<T extends Record<string, ZodSchema>>(schemas: T): { [K in keyof T]: z.infer<T[K]> } {
    return this.envProvider.getMany(schemas);
  }
}

export function defineConfig<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return {
    schema,
    parse: (values: Record<string, unknown>) => schema.parse(values),
    safeParse: (values: Record<string, unknown>) => schema.safeParse(values),
  };
}

export function getEnv<T>(key: string, options?: { required?: boolean; default?: T }): T {
  const provider = getDefaultProvider();
  const schema = (options?.default !== undefined ? z.any() : z.any()) as ZodSchema<T>;
  return provider.get(key, schema, options);
}

export function getEnvMany<T extends Record<string, ZodSchema>>(schemas: T): { [K in keyof T]: z.infer<T[K]> } {
  const provider = getDefaultProvider();
  return provider.getMany(schemas);
}

let defaultProvider: ConfigProvider | null = null;

function getDefaultProvider(): ConfigProvider {
  if (!defaultProvider) {
    defaultProvider = new EnvProvider();
  }
  return defaultProvider;
}

export function setDefaultProvider(provider: ConfigProvider): void {
  defaultProvider = provider;
}

export function createEnvProvider(): EnvProvider {
  return new EnvProvider();
}

export function createRemoteOverrideProvider(url: string, cacheTtl: number = 60000): RemoteOverrideProvider {
  return {
    async getOverrides(service: string): Promise<Record<string, unknown>> {
      try {
        const response = await fetch(`${url}/internal/config/overrides?service=${service}`);
        if (!response.ok) {
          return {};
        }
        const raw = (await response.json()) as unknown;
        return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    },
  };
}