export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { mcpListTools } from '@/lib/mcp'
import { withAudit } from '@/lib/audit'

function mask(s: { authToken: string | null }) {
  return { ...s, authToken: undefined, hasAuth: !!s.authToken }
}

async function _PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body?.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body?.url === 'string') {
    if (!/^https?:\/\//i.test(body.url.trim())) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    data.url = body.url.trim()
  }
  if (typeof body?.description === 'string') data.description = body.description.slice(0, 300) || null
  if (typeof body?.authToken === 'string') data.authToken = body.authToken || null
  if (typeof body?.isActive === 'boolean') data.isActive = body.isActive
  if (typeof body?.category === 'string' && ['general', 'crm', 'dtwin', 'analytics', 'devops', 'other'].includes(body.category)) data.category = body.category
  const server = await prisma.mcpServer.update({ where: { id }, data })
  return NextResponse.json(mask(server))
}

async function _DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const exists = await prisma.mcpServer.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'MCP server not found' }, { status: 404 })
  await prisma.mcpServer.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

// POST - connect to the MCP server and list its tools ("agents on server")
async function _POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const server = await prisma.mcpServer.findUnique({ where: { id } })
  if (!server) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const result = await mcpListTools(server.url, server.authToken)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.name === 'AbortError' ? 'Connection timed out' : (e?.message ?? 'Connection failed') })
  }
}

export const PATCH = withAudit(_PATCH, { entity: 'mcp_server' })
export const DELETE = withAudit(_DELETE, { entity: 'mcp_server' })
export const POST = withAudit(_POST, { entity: 'mcp_server', verbs: { POST: 'connect' } })
