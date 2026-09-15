export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { withAudit } from '@/lib/audit'

const MCP_CATEGORIES = ['general', 'crm', 'dtwin', 'analytics', 'devops', 'other'] as const

function mask(s: { authToken: string | null }) {
  return { ...s, authToken: undefined, hasAuth: !!s.authToken }
}

export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const servers = await prisma.mcpServer.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(servers.map(mask))
}

async function _POST(request: Request) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim()
  const url = String(body?.url ?? '').trim()
  if (!name || !/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'Name and a valid http(s) URL are required' }, { status: 400 })
  const server = await prisma.mcpServer.create({
    data: {
      name, url,
      description: typeof body?.description === 'string' ? body.description.slice(0, 300) : null,
      authToken: typeof body?.authToken === 'string' && body.authToken ? body.authToken : null,
      isActive: body?.isActive !== false,
      category: (MCP_CATEGORIES as readonly string[]).includes(body?.category) ? body.category : 'general',
    },
  })
  return NextResponse.json(mask(server), { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'mcp_server' })
