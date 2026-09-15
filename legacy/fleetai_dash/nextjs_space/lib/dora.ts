import { prisma } from '@/lib/db'

export const DORA_EVENT_TYPES = ['deployment', 'incident_opened', 'incident_resolved'] as const
export type DoraEventType = (typeof DORA_EVENT_TYPES)[number]

export type DoraMetrics = {
  windowDays: number
  deployments: number
  failedDeployments: number
  deploymentsPerWeek: number
  leadTimeMin: number | null
  changeFailureRate: number | null
  mttrMin: number | null
  incidentsOpened: number
  incidentsResolved: number
  services: string[]
}

export function rateBand(m: DoraMetrics) {
  // Simplified DORA performance bands (2023 State of DevOps report thresholds).
  const band = (v: number | null, elite: (x: number) => boolean, high: (x: number) => boolean, medium: (x: number) => boolean) =>
    v == null ? 'n/a' : elite(v) ? 'Elite' : high(v) ? 'High' : medium(v) ? 'Medium' : 'Low'
  return {
    frequency: band(m.deployments ? m.deploymentsPerWeek : null, x => x >= 7, x => x >= 1, x => x >= 0.25),
    leadTime: band(m.leadTimeMin, x => x <= 24 * 60, x => x <= 7 * 24 * 60, x => x <= 30 * 24 * 60),
    cfr: band(m.changeFailureRate, x => x <= 0.05, x => x <= 0.10, x => x <= 0.15),
    mttr: band(m.mttrMin, x => x <= 60, x => x <= 24 * 60, x => x <= 7 * 24 * 60),
  }
}

export async function computeDoraMetrics(windowDays = 30, service?: string): Promise<DoraMetrics> {
  const since = new Date(Date.now() - windowDays * 86_400_000)
  const where = { occurredAt: { gte: since }, ...(service ? { service } : {}) }
  const events = await prisma.doraEvent.findMany({ where, orderBy: { occurredAt: 'asc' } })
  const deploys = events.filter(e => e.type === 'deployment')
  const failed = deploys.filter(e => e.status === 'failed')
  const leads = deploys.map(e => e.leadTimeMin).filter((v): v is number => typeof v === 'number' && v >= 0)
  const opened = events.filter(e => e.type === 'incident_opened')
  const resolved = events.filter(e => e.type === 'incident_resolved')
  const openedById = new Map(opened.filter(e => e.incidentId).map(e => [e.incidentId as string, e.occurredAt]))
  const ttr: number[] = []
  for (const r of resolved) {
    const o = r.incidentId ? openedById.get(r.incidentId) : undefined
    if (o) ttr.push((r.occurredAt.getTime() - o.getTime()) / 60_000)
  }
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null)
  const services = Array.from(new Set(events.map(e => e.service))).sort()
  return {
    windowDays,
    deployments: deploys.length,
    failedDeployments: failed.length,
    deploymentsPerWeek: Math.round((deploys.length / windowDays) * 7 * 100) / 100,
    leadTimeMin: avg(leads),
    changeFailureRate: deploys.length ? Math.round((failed.length / deploys.length) * 1000) / 1000 : null,
    mttrMin: avg(ttr),
    incidentsOpened: opened.length,
    incidentsResolved: resolved.length,
    services,
  }
}
