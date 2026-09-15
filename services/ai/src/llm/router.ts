/**
 * services/ai/src/llm/router.ts — provider router with automatic fallback.
 *
 * Streaming chat against the primary provider (openrouter/free). When the
 * primary replies 429 / 402 / 403 (quota) or times out, and fallback is enabled,
 * the router switches to the fallback provider (cline-pass/deepseek-v4-flash)
 * and arms a cooldown so the quota-limited provider is not hammered.
 *
 * Exposes:
 * - `streamChatWithFailover(...)` — async generator used by generate-widget.
 * - `RouterStatus` — observable state for /health/ready and admin UI.
 */

import { LlmConfig, LlmProviderEndpoint, providerFromConfig } from './config';

export const QUOTA_STATUS_CODES = [429, 402, 403];

export interface RouterState {
  current: 'primary' | 'fallback';
  lastSwitchAt: number | null;
  switchReason: string | null;
  primaryFailures: number;
  fallbackFailures: number;
}

export function createRouter(cfg: LlmConfig, now: () => number = () => Date.now()) {
  const state: RouterState = {
    current: 'primary',
    lastSwitchAt: null,
    switchReason: null,
    primaryFailures: 0,
    fallbackFailures: 0,
  };

  function isCooldownActive(): boolean {
    return state.lastSwitchAt !== null && now() - state.lastSwitchAt < cfg.LLM_QUOTA_COOLDOWN_MS;
  }

  /** Choose the provider for the next call. */
  function resolve(): { provider: LlmProviderEndpoint; tier: 'primary' | 'fallback' } {
    if (cfg.LLM_FALLBACK_ENABLED && state.current === 'fallback' && !isCooldownActive()) {
      state.current = 'primary';
    }
    if (cfg.LLM_FALLBACK_ENABLED && (state.current === 'fallback' || isCooldownActive())) {
      return { provider: providerFromConfig(cfg, 'fallback'), tier: 'fallback' };
    }
    state.current = 'primary';
    return { provider: providerFromConfig(cfg, 'primary'), tier: 'primary' };
  }

  /** Record an outcome: success resets failures; quota errors flip to fallback. */
  function record(tier: 'primary' | 'fallback', ok: boolean, status?: number): void {
    if (ok) {
      if (tier === 'primary') state.primaryFailures = 0;
      else state.fallbackFailures = 0;
      return;
    }
    if (tier === 'primary') {
      state.primaryFailures += 1;
      if (status !== undefined && QUOTA_STATUS_CODES.includes(status)) {
        state.current = 'fallback';
        state.lastSwitchAt = now();
        state.switchReason = `primary quota/status ${status} after ${state.primaryFailures} failures`;
      }
    } else {
      state.fallbackFailures += 1;
    }
  }

  /** Force back to the primary provider (admin UI / cooldown expiry). */
  function reset(): void {
    state.current = 'primary';
    state.lastSwitchAt = null;
    state.switchReason = null;
    state.primaryFailures = 0;
    state.fallbackFailures = 0;
  }

  return { state, resolve, record, reset };
}

export type Router = ReturnType<typeof createRouter>;

// ---------------------------------------------------------------------------
// Streaming chat with failover
// ---------------------------------------------------------------------------

export type ChatArgs = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
};

export type UsageSink = { promptTokens?: number; completionTokens?: number };

export async function* streamChat(
  provider: LlmProviderEndpoint,
  args: ChatArgs,
  usage?: UsageSink
): AsyncGenerator<string> {
  // OpenAI-compatible chat completions (openrouter and cline-pass both speak it).
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers['Authorization'] = `Bearer ${provider.apiKey}`;
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: args.maxTokens ?? 4000,
    temperature: args.temperature ?? 0.1,
  };
  if (args.json) body['response_format'] = { type: 'json_object' };

  let res = await fetch(`${provider.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok && args.json) {
    // Some providers reject response_format / stream_options; retry without them.
    delete body['response_format'];
    delete body['stream_options'];
    res = await fetch(`${provider.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new ProviderError(res.status, `${provider.name} error (HTTP ${res.status}): ${errText.slice(0, 300)}`);
  }
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('text/event-stream')) {
    const data = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;
    if (usage && data?.usage) {
      usage.promptTokens = data.usage.prompt_tokens;
      usage.completionTokens = data.usage.completion_tokens;
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') yield content;
    return;
  }
  for await (const line of sseLines(res)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data) as {
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      };
      if (usage && parsed?.usage) {
        usage.promptTokens = parsed.usage.prompt_tokens;
        usage.completionTokens = parsed.usage.completion_tokens;
      }
      const delta = parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content ?? '';
      if (delta) yield delta;
    } catch {
      /* keep-alives */
    }
  }
}

export class ProviderError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

async function* sseLines(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response stream from provider');
  const decoder = new TextDecoder();
  let partial = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    partial += decoder.decode(value, { stream: true });
    const lines = partial.split('\n');
    partial = lines.pop() ?? '';
    for (const line of lines) yield line;
  }
  if (partial) yield partial;
}

/**
 * Streams the assistant response, failing over to the fallback provider on
 * quota errors. Returns { chunks, providerTier, usage }.
 */
export async function* streamChatWithFailover(
  router: Router,
  cfg: LlmConfig,
  args: ChatArgs,
  usage?: UsageSink
): AsyncGenerator<{ tier: 'primary' | 'fallback'; text: string }> {
  const { provider, tier } = router.resolve();
  const usageSink: UsageSink = usage ?? {};
  try {
    for await (const delta of streamChat(provider, args, usageSink)) {
      yield { tier, text: delta };
    }
    router.record(tier, true);
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : undefined;
    router.record(tier, false, status);
    if (cfg.LLM_FALLBACK_ENABLED && tier === 'primary') {
      // Retry once on the fallback provider.
      const fallbackProvider = providerFromConfig(cfg, 'fallback');
      for await (const delta of streamChat(fallbackProvider, args, usageSink)) {
        yield { tier: 'fallback', text: delta };
      }
      router.record('fallback', true);
      return;
    }
    throw err;
  }
}

/** Quick connectivity test used by the admin UI (like legacy testProvider). */
export async function testProvider(provider: LlmProviderEndpoint): Promise<{ ok: boolean; reply: string; latencyMs: number }> {
  const started = Date.now();
  let out = '';
  for await (const d of streamChat(provider, { system: 'Reply with the single word OK.', user: 'ping', maxTokens: 5, temperature: 0 })) {
    out += d;
    if (out.length > 50) break;
  }
  return { ok: true, reply: out.trim().slice(0, 100), latencyMs: Date.now() - started };
}

/** Extracts the first JSON object from a model reply (handles fences/prose). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fallthrough */
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error('No JSON object in response');
}
