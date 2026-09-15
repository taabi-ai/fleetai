# Model Configuration with Automatic Fallback

This configuration enables automatic model switching when quota limits are reached.
**Implemented in `services/ai/src/llm/`** (`config.ts` + `router.ts`) — not just docs.

## Model Hierarchy

1. **Primary**: `openrouter/free` — free tier via OpenRouter (`LLM_PRIMARY_BASE_URL` + `LLM_PRIMARY_MODEL`)
2. **Fallback**: `cline-pass/deepseek-v4-flash` — DeepSeek v4 Flash via cline-pass (`LLM_FALLBACK_BASE_URL` + `LLM_FALLBACK_MODEL`)

## Quick start

```bash
# .env / service env (values read via @fleetai/config — never raw process.env)
LLM_PRIMARY_BASE_URL=https://openrouter.ai/api/v1
LLM_PRIMARY_MODEL=openrouter/free
LLM_PRIMARY_API_KEY=your_openrouter_key
LLM_FALLBACK_BASE_URL=https://your-cline-pass-endpoint/v1
LLM_FALLBACK_MODEL=cline-pass/deepseek-v4-flash
LLM_FALLBACK_API_KEY=your_cline_pass_key
LLM_FALLBACK_ENABLED=true          # default true
LLM_QUOTA_COOLDOWN_MS=60000        # cooldown after a switch (60s)
```

## Router behaviour (`services/ai/src/llm/router.ts`)

- `createRouter(cfg, now?)` → `{ state, resolve, record, reset }`
- Streaming chat: `streamChatWithFailover(router, cfg, args, usage?)` — yields
  `{ tier: 'primary'|'fallback', text }`.
- Automatic switch to fallback when the primary returns:
  - HTTP **429** (rate limit / quota)
  - HTTP **402** / **403** (payment/quota)
  - upstream failure
- Cooldown: after a switch, `resolve()` keeps using the fallback for
  `LLM_QUOTA_COOLDOWN_MS` so the quota-limited provider is not hammered, then
  returns to primary on the next call.
- `RouterState` (`current`, `lastSwitchAt`, `switchReason`, `primaryFailures`,
  `fallbackFailures`) is observable — wire it into `/health/ready` and the
  admin UI (prompt 05).

## Tests

`pnpm --filter @fleetai/ai test` — `test/llm-router.spec.ts` covers:
success-path (no fallback touched), 429 → failover to deepseek-v4-flash,
cooldown window, both-down error, JSON extraction.
