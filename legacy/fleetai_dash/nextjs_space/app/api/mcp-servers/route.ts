export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'

// GET - active MCP servers available to every signed-in user (no secrets exposed)
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const servers = await prisma.mcpServer.findMany({
    where: { isActive: true },
    select: { id: true, name: true, url: true, description: true, category: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(servers)
}
