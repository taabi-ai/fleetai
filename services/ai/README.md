# @fleetai/ai

AI assistant service (widget generation, LLM providers, MCP servers, AI PIN, usage).

## Implemented so far (scaffold)

- `src/llm/config.ts` — provider configuration with automatic fallback:
  primary `openrouter/free` → fallback `cline-pass/deepseek-v4-flash`.
- `src/llm/router.ts` — streaming chat with failover on quota errors
  (429/402/403), cooldown, status observable for admin/health.
- `test/llm-router.spec.ts` — proves failover, cooldown, both-down error paths.

## Env vars (via @fleetai/config, see src/llm/config.ts)

```
LLM_PRIMARY_BASE_URL=https://openrouter.ai/api/v1
LLM_PRIMARY_MODEL=openrouter/free
LLM_PRIMARY_API_KEY=
LLM_FALLBACK_BASE_URL=...
LLM_FALLBACK_MODEL=cline-pass/deepseek-v4-flash
LLM_FALLBACK_API_KEY=
LLM_FALLBACK_ENABLED=true
LLM_QUOTA_COOLDOWN_MS=60000
```

## Remaining (prompt 05)

generate-widget endpoint (sync + SSE), pgmq async jobs, LLM provider registry,
MCP server registry, AI PIN module, usage recording.
