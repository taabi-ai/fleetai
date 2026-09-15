export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

/**
 * Liveness / readiness probe for Docker HEALTHCHECK, Kubernetes probes and uptime monitors.
 * Public and unauthenticated by design; it never exposes configuration or secrets.
 *   200 { ok: true,  db: 'up',   ... }  – ready to serve traffic
 *   503 { ok: false, db: 'down', ... }  – process is alive but the database is unreachable
 */
export async function GET() {
  const startedAt = Date.now()
  let db: 'up' | 'down' = 'down'
  try {
    await prisma.$queryRaw`SELECT 1`
    db = 'up'
  } catch {
    db = 'down'
  }
  const body = {
    ok: db === 'up',
    db,
    dbLatencyMs: Date.now() - startedAt,
    uptimeSec: Math.round(process.uptime()),
    version: process.env.APP_VERSION ?? null,
    timestamp: new Date().toISOString(),
  }
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
