export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getIntegration } from '@/lib/integrations'
import { requirePermission } from '@/lib/rbac'

// Deterministic sample scorecards (seeded PRNG) shown until the CRM MCP / REST integration is connected.
function seeded(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 } }

const KAMS = ['Priya Menon', 'Rohit Bansal', 'Neha Kulkarni', 'Arjun Rao', 'Sneha Pillai', 'Karan Malhotra']
const SALES = ['Vikas Jain', 'Anjali Saxena', 'Farhan Khan', 'Meera Nambiar', 'Siddharth Bose', 'Pooja Rathi', 'Nikhil Shetty']
const MARKETING = ['Inbound / SEO', 'Paid campaigns', 'Events & expos', 'Partner referrals', 'Outbound SDR']
const STAGES = ['New', 'Qualified', 'Demo done', 'Proposal', 'Negotiation', 'Won']

export async function GET() {
  if (!(await requirePermission('crm.view'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [crm, mcp] = await Promise.all([
    getIntegration('crm'),
    prisma.mcpServer.findMany({ where: { isActive: true, category: { in: ['crm', 'dtwin'] } }, select: { id: true, name: true, url: true, category: true, description: true } }),
  ])
  const rnd = seeded(20260906)
  const int = (a: number, b: number) => Math.floor(rnd() * (b - a + 1)) + a
  const kams = KAMS.map(name => {
    const accounts = int(6, 18); const onboarded = int(2, accounts)
    return { name, accounts, onboarded, onboardingPct: Math.round((onboarded / accounts) * 100), arrLakh: int(40, 260), nps: int(28, 72), churnRisk: int(0, 3), onboardedDaysAgo: int(30, 540) }
  })
  const sales = SALES.map(name => {
    const leads = int(25, 90); const qualified = int(10, leads); const won = int(1, Math.max(1, Math.floor(qualified / 3)))
    return { name, leads, qualified, won, winRate: Math.round((won / Math.max(1, qualified)) * 100), pipelineLakh: int(30, 220), quotaPct: int(45, 130), tenureMonths: int(2, 40) }
  })
  const marketing = MARKETING.map(channel => { const leads = int(40, 300); const mql = int(10, leads); return { channel, leads, mql, mqlPct: Math.round((mql / leads) * 100), cplInr: int(400, 4800), spendLakh: int(1, 18) } })
  const funnel = STAGES.map((stage, i) => ({ stage, count: Math.max(3, Math.round(420 * Math.pow(0.55, i))) }))
  const totals = {
    leads: sales.reduce((a, s) => a + s.leads, 0),
    customers: kams.reduce((a, k) => a + k.accounts, 0),
    onboarded: kams.reduce((a, k) => a + k.onboarded, 0),
    pipelineLakh: sales.reduce((a, s) => a + s.pipelineLakh, 0),
  }
  return NextResponse.json({
    sample: true,
    sources: { crm: { configured: !!crm?.config.apiKey, enabled: !!crm?.enabled, baseUrl: crm?.config.baseUrl ?? null }, mcp },
    totals, kams, sales, marketing, funnel,
  })
}
