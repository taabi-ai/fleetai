/**
 * services/ai/src/llm/config.ts — LLM provider configuration with automatic
 * fallback. Ported from legacy `lib/llm.ts` + `lib/env.ts` semantics.
 *
 * Primary: openrouter/free (free tier)
 * Fallback: cline-pass/deepseek-v4-flash
 *
 * When the primary rejects with 429 / quota-exceeded, the router switches to the
 * fallback and remembers the cooldown so it stops hammering the quota-limit
 * provider. All values read via @fleetai/config (no raw process.env).
 */

import { z } from 'zod';
import { defineConfig } from '@fleetai/config';

export const LLM_CONFIG_SCHEMA = z.object({
  LLM_PRIMARY_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  LLM_PRIMARY_MODEL: z.string().default('openrouter/free'),
  LLM_PRIMARY_API_KEY: z.string().optional(),
  LLM_FALLBACK_BASE_URL: z.string().url().default('https://api.cline-pass.local/v1'),
  LLM_FALLBACK_MODEL: z.string().default('cline-pass/deepseek-v4-flash'),
  LLM_FALLBACK_API_KEY: z.string().optional(),
  LLM_DEFAULT_MODEL: z.string().default('gpt-5.4-mini'),
  LLM_FALLBACK_ENABLED: z.boolean().default(true),
  LLM_FALLBACK_ON: z.string().default('429'),
  LLM_QUOTA_COOLDOWN_MS: z.coerce.number().default(60_000),
  LLM_TIMEOUT_MS: z.coerce.number().default(60_000),
});

export type LlmConfig = z.infer<typeof LLM_CONFIG_SCHEMA>;

export const llmConfig = defineConfig(LLM_CONFIG_SCHEMA);

/** A single resolvable provider endpoint. */
export interface LlmProviderEndpoint {
  id: string | null;
  name: string;
  kind: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function providerFromConfig(cfg: LlmConfig, tier: 'primary' | 'fallback'): LlmProviderEndpoint {
  if (tier === 'primary') {
    return {
      id: 'primary',
      name: 'OpenRouter (free)',
      kind: 'openai',
      baseUrl: cfg.LLM_PRIMARY_BASE_URL.replace(/\/$/, ''),
      apiKey: cfg.LLM_PRIMARY_API_KEY ?? '',
      model: cfg.LLM_PRIMARY_MODEL,
    };
  }
  return {
    id: 'fallback',
    name: 'DeepSeek v4 Flash (cline-pass)',
    kind: 'openai',
    baseUrl: cfg.LLM_FALLBACK_BASE_URL.replace(/\/$/, ''),
    apiKey: cfg.LLM_FALLBACK_API_KEY ?? '',
    model: cfg.LLM_FALLBACK_MODEL,
  };
}

export const DEFAULT_BUILTIN_PROVIDER = (cfg: LlmConfig): LlmProviderEndpoint => ({
  id: null,
  name: 'Abacus.AI RouteLLM (built-in)',
  kind: 'openai',
  baseUrl: 'https://apps.abacus.ai/v1',
  apiKey: cfg.LLM_PRIMARY_API_KEY ?? '',
  model: cfg.LLM_DEFAULT_MODEL,
});
