/**
 * Catalog of LLM provider presets the super admin can pick from.
 * kind: 'openai' = OpenAI-compatible /chat/completions API, 'anthropic' = Anthropic Messages API.
 * Any provider not listed can be added as "Custom" with its own base URL.
 */
export type LlmKind = 'openai' | 'anthropic'

export type LlmPreset = {
  id: string
  name: string
  kind: LlmKind
  baseUrl: string
  defaultModel: string
  docs?: string
  free?: boolean
  note?: string
}

export const LLM_PRESETS: LlmPreset[] = [
  { id: 'abacus', name: 'Abacus.AI RouteLLM (built-in)', kind: 'openai', baseUrl: 'https://apps.abacus.ai/v1', defaultModel: 'gpt-5.4-mini', docs: 'https://abacus.ai/help/developer-platform/route-llm', note: 'Uses the platform key when API key is left blank.' },
  { id: 'openai', name: 'OpenAI', kind: 'openai', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', docs: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic Claude', kind: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-3-5-haiku-latest', docs: 'https://console.anthropic.com/settings/keys' },
  { id: 'deepseek', name: 'DeepSeek', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', docs: 'https://platform.deepseek.com/api_keys' },
  { id: 'opencode-zen', name: 'OpenCode Zen (incl. free models)', kind: 'openai', baseUrl: 'https://opencode.ai/zen/v1', defaultModel: 'grok-code', docs: 'https://opencode.ai/docs/zen/', free: true },
  { id: 'openrouter', name: 'OpenRouter (100+ models)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', docs: 'https://openrouter.ai/keys', free: true, note: 'Models ending in ":free" are free-tier.' },
  { id: 'kilo-code', name: 'Kilo Code (OpenRouter-compatible)', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', docs: 'https://kilo.ai/docs/ai-providers/openrouter' },
  { id: 'cline', name: 'Cline API', kind: 'openai', baseUrl: 'https://api.cline.bot/api/v1', defaultModel: 'anthropic/claude-3-5-haiku', docs: 'https://docs.cline.bot/provider-config/openai-compatible' },
  { id: 'nvidia-nim', name: 'NVIDIA NIM', kind: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: 'meta/llama-3.1-70b-instruct', docs: 'https://build.nvidia.com/', free: true },
  { id: 'groq', name: 'Groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', docs: 'https://console.groq.com/keys', free: true },
  { id: 'mistral', name: 'Mistral AI', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-small-latest', docs: 'https://console.mistral.ai/api-keys' },
  { id: 'gemini', name: 'Google Gemini (OpenAI-compatible)', kind: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.0-flash', docs: 'https://aistudio.google.com/apikey', free: true },
  { id: 'xai', name: 'xAI Grok', kind: 'openai', baseUrl: 'https://api.x.ai/v1', defaultModel: 'grok-3-mini', docs: 'https://console.x.ai/' },
  { id: 'together', name: 'Together AI', kind: 'openai', baseUrl: 'https://api.together.xyz/v1', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', docs: 'https://api.together.ai/settings/api-keys' },
  { id: 'fireworks', name: 'Fireworks AI', kind: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', defaultModel: 'accounts/fireworks/models/llama-v3p1-70b-instruct', docs: 'https://fireworks.ai/account/api-keys' },
  { id: 'perplexity', name: 'Perplexity', kind: 'openai', baseUrl: 'https://api.perplexity.ai', defaultModel: 'sonar', docs: 'https://www.perplexity.ai/settings/api' },
  { id: 'cerebras', name: 'Cerebras', kind: 'openai', baseUrl: 'https://api.cerebras.ai/v1', defaultModel: 'llama3.1-8b', docs: 'https://cloud.cerebras.ai/', free: true },
  { id: 'huggingface', name: 'Hugging Face Inference', kind: 'openai', baseUrl: 'https://router.huggingface.co/v1', defaultModel: 'meta-llama/Llama-3.1-8B-Instruct', docs: 'https://huggingface.co/settings/tokens', free: true },
  { id: 'moonshot', name: 'Moonshot Kimi', kind: 'openai', baseUrl: 'https://api.moonshot.ai/v1', defaultModel: 'kimi-k2-0711-preview', docs: 'https://platform.moonshot.ai/' },
  { id: 'qwen', name: 'Alibaba Qwen (DashScope)', kind: 'openai', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-plus', docs: 'https://modelstudio.console.alibabacloud.com/' },
  { id: 'zhipu', name: 'Zhipu GLM', kind: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-flash', docs: 'https://open.bigmodel.cn/', free: true },
  { id: 'ollama', name: 'Ollama (self-hosted)', kind: 'openai', baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.1', docs: 'https://ollama.com/', free: true, note: 'Point the base URL at your reachable Ollama host.' },
  { id: 'lmstudio', name: 'LM Studio (self-hosted)', kind: 'openai', baseUrl: 'http://localhost:1234/v1', defaultModel: 'local-model', free: true },
  { id: 'azure', name: 'Azure OpenAI', kind: 'openai', baseUrl: 'https://<resource>.openai.azure.com/openai/deployments/<deployment>', defaultModel: 'gpt-4o-mini', docs: 'https://portal.azure.com/', note: 'Replace <resource> and <deployment>; add ?api-version if required by your gateway.' },
  { id: 'hcnsec', name: 'HCNSec Gateway (OpenAI-compatible)', kind: 'openai', baseUrl: 'https://<your-hcnsec-gateway>/v1', defaultModel: 'gpt-4o-mini', note: 'Enter the base URL supplied by your gateway.' },
  { id: 'commandcode', name: 'CommandCode (OpenAI-compatible)', kind: 'openai', baseUrl: 'https://<your-commandcode-endpoint>/v1', defaultModel: 'gpt-4o-mini', note: 'Enter the base URL supplied by the provider.' },
  { id: 'cline-pass', name: 'Cline Pass / other pass-through gateway', kind: 'openai', baseUrl: 'https://<gateway-host>/v1', defaultModel: 'gpt-4o-mini', note: 'Any OpenAI-compatible pass-through gateway.' },
  { id: 'custom-openai', name: 'Custom (OpenAI-compatible)', kind: 'openai', baseUrl: 'https://', defaultModel: '' },
  { id: 'custom-anthropic', name: 'Custom (Anthropic-compatible)', kind: 'anthropic', baseUrl: 'https://', defaultModel: '' },
]
