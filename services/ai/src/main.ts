/**
 * services/ai — AI assistant service (prompt 05).
 *
 * This file is a placeholder bootstrap. Core LLM failover logic lives in
 * src/llm/ (config.ts + router.ts) and is fully tested. The full service
 * (generate-widget endpoint, pgmq worker, MCP registry, PIN module) is built
 * by prompt 05 from the _template skeleton.
 */

import { llmConfig } from './llm/config';

const cfg = llmConfig.parse(process.env as Record<string, string>);
console.log(`[ai] scaffold only — service built by prompt 05. model=${cfg.LLM_PRIMARY_MODEL} fallback=${cfg.LLM_FALLBACK_MODEL}`);
