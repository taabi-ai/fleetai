export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/admin'
import { getActiveProvider } from '@/lib/llm'

// GET - server / deployment overview for the admin console
export async function GET() {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [users, dashboards, widgets, mcp, llm, smtp, notifications, provider] = await Promise.all([
    prisma.user.count(),
    prisma.dashboard.count(),
    prisma.widget.count(),
    prisma.mcpServer.count({ where: { isActive: true } }),
    prisma.llmProvider.count({ where: { isActive: true } }),
    prisma.smtpSetting.findUnique({ where: { id: 'default' }, select: { host: true, fromEmail: true } }),
    prisma.notification.count(),
    getActiveProvider(),
  ])
  const mem = process.memoryUsage()
  return NextResponse.json({
    counts: { users, dashboards, widgets, mcpServers: mcp, llmProviders: llm, notifications },
    smtpConfigured: !!smtp,
    smtpHost: smtp?.host ?? null,
    activeProvider: { name: provider.name, model: provider.model, kind: provider.kind },
    server: {
      node: process.version,
      platform: process.platform,
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(mem.rss / 1024 / 1024),
      env: process.env.NODE_ENV,
      appUrl: process.env.NEXTAUTH_URL ?? null,
      builtWithAbacusKey: !!process.env.ABACUSAI_API_KEY,
    },
  })
}
