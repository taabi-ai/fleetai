/**
 * Minimal MCP (Model Context Protocol) client over Streamable HTTP / JSON-RPC.
 * Used by the admin "Agents" page to connect to a configured MCP server and list its tools.
 */
export type McpTool = { name: string; description?: string }

function headersFor(token?: string | null, sessionId?: string | null) {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  }
  if (token) h.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`
  if (sessionId) h['Mcp-Session-Id'] = sessionId
  return h
}

async function parseJsonRpc(res: Response): Promise<any> {
  const ct = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (ct.includes('text/event-stream')) {
    // Take the last JSON data event
    const events = text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim())
    for (let i = events.length - 1; i >= 0; i--) {
      try { return JSON.parse(events[i]) } catch { /* continue */ }
    }
    throw new Error('No JSON-RPC payload in event stream')
  }
  try { return JSON.parse(text) } catch { throw new Error(`Unexpected response (${res.status}): ${text.slice(0, 200)}`) }
}

export async function mcpListTools(url: string, token?: string | null, timeoutMs = 10000): Promise<{ serverInfo?: any; tools: McpTool[] }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const initRes = await fetch(url, {
      method: 'POST',
      headers: headersFor(token),
      signal: ctrl.signal,
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'fleetai-dash', version: '1.0.0' } },
      }),
    })
    if (!initRes.ok) throw new Error(`initialize failed: HTTP ${initRes.status}`)
    const init = await parseJsonRpc(initRes)
    if (init?.error) throw new Error(init.error.message ?? 'initialize error')
    const sessionId = initRes.headers.get('mcp-session-id')

    await fetch(url, {
      method: 'POST', headers: headersFor(token, sessionId), signal: ctrl.signal,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    }).catch(() => null)

    const toolsRes = await fetch(url, {
      method: 'POST', headers: headersFor(token, sessionId), signal: ctrl.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
    })
    if (!toolsRes.ok) throw new Error(`tools/list failed: HTTP ${toolsRes.status}`)
    const tools = await parseJsonRpc(toolsRes)
    if (tools?.error) throw new Error(tools.error.message ?? 'tools/list error')
    return {
      serverInfo: init?.result?.serverInfo,
      tools: (tools?.result?.tools ?? []).map((t: any) => ({ name: t.name, description: t.description })),
    }
  } finally {
    clearTimeout(t)
  }
}
