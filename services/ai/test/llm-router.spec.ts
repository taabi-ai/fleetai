import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRouter, streamChat, streamChatWithFailover, ProviderError, extractJson } from '../src/llm/router';
import type { LlmProviderEndpoint } from '../src/llm/config';
import { StubServer } from '@fleetai/testing';
import type { LlmConfig } from '../src/llm/config';

const cfgBase: Partial<LlmConfig> = {
  LLM_PRIMARY_BASE_URL: 'http://primary.test/v1',
  LLM_PRIMARY_MODEL: 'openrouter/free',
  LLM_PRIMARY_API_KEY: 'pk',
  LLM_FALLBACK_BASE_URL: 'http://fallback.test/v1',
  LLM_FALLBACK_MODEL: 'cline-pass/deepseek-v4-flash',
  LLM_FALLBACK_API_KEY: 'fk',
  LLM_FALLBACK_ENABLED: true,
  LLM_FALLBACK_ON: '429',
  LLM_QUOTA_COOLDOWN_MS: 60_000,
  LLM_TIMEOUT_MS: 10_000,
  LLM_DEFAULT_MODEL: 'gpt-5.4-mini',
};

function fakeProvider(baseUrl: string, name: string, model: string): LlmProviderEndpoint {
  return { id: name, name, kind: 'openai', baseUrl, apiKey: 'k', model };
}

describe('llm router failover', () => {
  let primary: StubServer;
  let fallback: StubServer;

  beforeEach(async () => {
    primary = new StubServer();
    fallback = new StubServer();
    await primary.start();
    await fallback.start();
  });

  afterEach(async () => {
    await primary.stop();
    await fallback.stop();
  });

  it('uses the primary provider on success and never touches fallback', async () => {
    primary.when((m, u) => m === 'POST' && u.includes('/chat/completions'), () => ({
      status: 200,
      body: { choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } },
    }));

    const cfg = { ...cfgBase, LLM_PRIMARY_BASE_URL: primary.baseUrl, LLM_FALLBACK_BASE_URL: fallback.baseUrl } as LlmConfig;
    const router = createRouter(cfg);
    let text = '';
    for await (const chunk of streamChatWithFailover(router, cfg, { system: 's', user: 'u' })) {
      text += chunk.text;
      expect(chunk.tier).toBe('primary');
    }
    expect(text).toContain('ok');
    expect(router.state.current).toBe('primary');
    expect(router.state.primaryFailures).toBe(0);
    expect(fallback.requests.length).toBe(0);
  });

  it('fails over to cline-pass/deepseek-v4-flash when primary returns 429 (quota)', async () => {
    primary.when((m, u) => m === 'POST' && u.includes('/chat/completions'), () => ({
      status: 429,
      body: { error: { message: 'quota exceeded (free tier)' } },
    }));
    fallback.when((m, u) => m === 'POST' && u.includes('/chat/completions'), () => ({
      status: 200,
      body: { choices: [{ message: { content: '{"type":"kpi_card"}' } }] },
    }));

    const cfg = { ...cfgBase, LLM_PRIMARY_BASE_URL: primary.baseUrl, LLM_FALLBACK_BASE_URL: fallback.baseUrl } as LlmConfig;
    const router = createRouter(cfg);
    const tiers: string[] = [];
    for await (const chunk of streamChatWithFailover(router, cfg, { system: 's', user: 'u' })) {
      tiers.push(chunk.tier);
    }
    expect(tiers).toContain('fallback');
    // The fallback model is what the fallback provider is configured with.
    expect(router.state.current).toBe('fallback');
    expect(router.state.switchReason).toContain('429');
    const fbReq = fallback.lastRequest();
    expect(fbReq?.body).toContain('deepseek-v4-flash');
  });

  it('respects the cooldown: while in cooldown, resolves directly to fallback', () => {
    let t = 0;
    const cfg = { ...cfgBase } as LlmConfig;
    const router = createRouter(cfg, () => t);
    router.record('primary', false, 429);
    expect(router.state.current).toBe('fallback');

    // Within cooldown → fallback.
    const first = router.resolve();
    expect(first.tier).toBe('fallback');

    // After cooldown expires → primary again.
    t = cfg.LLM_QUOTA_COOLDOWN_MS + 1;
    const second = router.resolve();
    expect(second.tier).toBe('primary');
  });

  it('throws when fallback also fails', async () => {
    primary.when((m, u) => m === 'POST' && u.includes('/chat/completions'), () => ({ status: 429, body: {} }));
    fallback.when((m, u) => m === 'POST' && u.includes('/chat/completions'), () => ({ status: 503, body: {} }));
    const cfg = { ...cfgBase, LLM_PRIMARY_BASE_URL: primary.baseUrl, LLM_FALLBACK_BASE_URL: fallback.baseUrl } as LlmConfig;
    const router = createRouter(cfg);
    await expect(async () => {
      for await (const _ of streamChatWithFailover(router, cfg, { system: 's', user: 'u' })) {
        /* drain */
      }
    }).rejects.toThrow(/503|error/i);
  });

  it('extracts JSON from fenced model output', () => {
    const obj = extractJson('```json\n{"type":"kpi_card"}\n```');
    expect(obj).toEqual({ type: 'kpi_card' });
  });

  it('ProviderError carries the quota status code', async () => {
    const server = new StubServer();
    const { baseUrl } = await server.start();
    server.when(() => true, () => ({ status: 429, body: { error: { message: 'nope' } } }));
    const p = fakeProvider(baseUrl, 'primary', 'openrouter/free');
    await expect(async () => {
      for await (const _ of streamChat(p, { system: 's', user: 'u' })) {
        /* drain */
      }
    }).rejects.toMatchObject({ status: 429 });
    await server.stop();
  });
});
