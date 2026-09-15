import { prisma } from '@/lib/db'
import { getEnv } from '@/lib/env'
import type { LlmKind } from '@/lib/llm-presets'

export type ResolvedProvider = {
  id: string | null
  name: string
  kind: LlmKind
  baseUrl: string
  apiKey: string
  model: string
}

const BUILTIN: ResolvedProvider = {
  id: null,
  name: 'Abacus.AI RouteLLM (built-in)',
  kind: 'openai',
  baseUrl: 'https://apps.abacus.ai/v1',
  apiKey: process.env.ABACUSAI_API_KEY ?? '',
  model: 'gpt-5.4-mini',
}

function isAbacus(url: string) {
  return /apps\.abacus\.ai/i.test(url)
}

export function toResolved(p: { id: string; name: string; kind: string; baseUrl: string; apiKey: string | null; model: string }): ResolvedProvider {
  return {
    id: p.id,
    name: p.name,
    kind: (p.kind === 'anthropic' ? 'anthropic' : 'openai'),
    baseUrl: p.baseUrl.replace(/\/$/, ''),
    // The built-in Abacus gateway can be used without a key by falling back to the platform key.
    apiKey: p.apiKey || (isAbacus(p.baseUrl) ? (process.env.ABACUSAI_API_KEY ?? '') : ''),
    model: p.model,
  }
}

/** The provider the AI assistant should use: the active default, else any active provider, else the built-in gateway. */
export async function getActiveProvider(): Promise<ResolvedProvider> {
  const p = await prisma.llmProvider.findFirst({
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
  })
  const platformKey = await getEnv('ABACUSAI_API_KEY')
  if (!p) return { ...BUILTIN, apiKey: platformKey || BUILTIN.apiKey }
  const r = toResolved(p)
  if (!r.apiKey && isAbacus(r.baseUrl)) r.apiKey = platformKey
  return r
}

export type ChatArgs = {
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  json?: boolean
}

/** Filled in by the stream functions when the provider reports token usage. */
export type UsageSink = { promptTokens?: number; completionTokens?: number }

/**
 * Streams the assistant text for a single system+user exchange.
 * Yields text deltas. Throws with a readable message if the upstream call fails.
 */
export async function* streamChat(p: ResolvedProvider, args: ChatArgs, usage?: UsageSink): AsyncGenerator<string> {
  if (p.kind === 'anthropic') {
    yield* streamAnthropic(p, args, usage)
  } else {
    yield* streamOpenAI(p, args, usage)
  }
}

async function* sseLines(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response stream from provider')
  const decoder = new TextDecoder()
  let partial = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    partial += decoder.decode(value, { stream: true })
    const lines = partial.split('\n')
    partial = lines.pop() ?? ''
    for (const line of lines) yield line
  }
  if (partial) yield partial
}

async function* streamOpenAI(p: ResolvedProvider, args: ChatArgs, usage?: UsageSink): AsyncGenerator<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (p.apiKey) headers.Authorization = `Bearer ${p.apiKey}`
  const body: Record<string, unknown> = {
    model: p.model,
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: args.maxTokens ?? 500,
    temperature: args.temperature ?? 0.1,
  }
  if (args.json) body.response_format = { type: 'json_object' }

  let res = await fetch(`${p.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok && args.json) {
    // Some providers reject response_format / stream_options; retry without them.
    delete body.response_format
    delete body.stream_options
    res = await fetch(`${p.baseUrl}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) })
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`${p.name} error (HTTP ${res.status}): ${errText.slice(0, 300)}`)
  }
  const ct = res.headers.get('content-type') ?? ''
  if (!ct.includes('text/event-stream')) {
    // Non-streaming provider: return the whole message.
    const data = await res.json().catch(() => null)
    const content = data?.choices?.[0]?.message?.content
    if (usage && data?.usage) { usage.promptTokens = data.usage.prompt_tokens; usage.completionTokens = data.usage.completion_tokens }
    if (typeof content === 'string') yield content
    return
  }
  for await (const line of sseLines(res)) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') continue
    try {
      const parsed = JSON.parse(data)
      if (usage && parsed?.usage) { usage.promptTokens = parsed.usage.prompt_tokens; usage.completionTokens = parsed.usage.completion_tokens }
      const delta = parsed?.choices?.[0]?.delta?.content ?? parsed?.choices?.[0]?.message?.content ?? ''
      if (delta) yield delta
    } catch { /* ignore keep-alives */ }
  }
}

async function* streamAnthropic(p: ResolvedProvider, args: ChatArgs, usage?: UsageSink): AsyncGenerator<string> {
  const base = p.baseUrl.endsWith('/v1') ? p.baseUrl : `${p.baseUrl}/v1`
  const res = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': p.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: p.model,
      system: args.system,
      messages: [{ role: 'user', content: args.user }],
      max_tokens: args.maxTokens ?? 500,
      temperature: args.temperature ?? 0.1,
      stream: true,
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`${p.name} error (HTTP ${res.status}): ${errText.slice(0, 300)}`)
  }
  for await (const line of sseLines(res)) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (!data) continue
    try {
      const ev = JSON.parse(data)
      if (ev?.type === 'content_block_delta' && ev?.delta?.type === 'text_delta') yield ev.delta.text ?? ''
      if (usage && ev?.type === 'message_start' && ev?.message?.usage) usage.promptTokens = ev.message.usage.input_tokens
      if (usage && ev?.type === 'message_delta' && ev?.usage) usage.completionTokens = ev.usage.output_tokens
      if (ev?.type === 'error') throw new Error(ev?.error?.message ?? 'Anthropic stream error')
    } catch (e) {
      if (e instanceof Error && !(e instanceof SyntaxError)) throw e
    }
  }
}

/** Extracts the first JSON object from a model reply (handles ```json fences and prose). */
export function extractJson(text: string): any {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  try { return JSON.parse(cleaned) } catch { /* fallthrough */ }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
  throw new Error('No JSON object in response')
}

/** Quick connectivity test used by the admin UI. */
export async function testProvider(p: ResolvedProvider) {
  const started = Date.now()
  let out = ''
  for await (const d of streamChat(p, { system: 'Reply with the single word OK.', user: 'ping', maxTokens: 5, temperature: 0 })) {
    out += d
    if (out.length > 50) break
  }
  return { ok: true, reply: out.trim().slice(0, 100), latencyMs: Date.now() - started }
}

/** Strips the API key before sending a provider record to the browser. */
export function maskProvider<T extends { apiKey: string | null }>(p: T) {
  return { ...p, apiKey: undefined, hasKey: !!p.apiKey, keyHint: p.apiKey ? `••••${p.apiKey.slice(-4)}` : null }
}
