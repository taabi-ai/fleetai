import { prisma } from '@/lib/db'
import { createHmac } from 'crypto'

/**
 * A user can access a dashboard if they own it, or if it has been published
 * to the internal marketplace (published dashboards are collaboratively editable;
 * widget locks protect individual widgets from other editors).
 */
export async function getAccessibleDashboard(dashboardId: string, userId: string) {
  const dashboard = await prisma.dashboard.findUnique({
    where: { id: dashboardId },
    select: { id: true, userId: true, isPublished: true },
  })
  if (!dashboard) return null
  if (dashboard.userId !== userId && !dashboard.isPublished) {
    // Explicitly shared with this user?
    const share = await prisma.dashboardShare.findUnique({ where: { dashboardId_userId: { dashboardId, userId } }, select: { id: true } })
    if (!share) return null
  }
  return dashboard
}

export function isLockedByOther(widget: { lockedById: string | null }, userId: string) {
  return !!widget.lockedById && widget.lockedById !== userId
}

export const WIDGET_INCLUDE = {
  lockedBy: { select: { id: true, name: true, email: true } },
} as const

export const DASHBOARD_INCLUDE = {
  widgets: { include: WIDGET_INCLUDE, orderBy: { createdAt: 'asc' as const } },
  user: { select: { id: true, name: true, email: true } },
} as const

// ---- AI Assistant PIN unlock cookie ----
export const AI_UNLOCK_COOKIE = 'fleetai_ai_unlock'

function secret() {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? 'fleetai-dev-secret'
}

export function aiUnlockToken(userId: string, pinHash: string) {
  // Token is bound to the user AND the current PIN hash, so changing the PIN invalidates it.
  return createHmac('sha256', secret()).update(`${userId}:${pinHash}`).digest('hex')
}

export function isAiUnlocked(cookieValue: string | undefined, userId: string, pinHash: string | null) {
  if (!pinHash) return true
  if (!cookieValue) return false
  return cookieValue === aiUnlockToken(userId, pinHash)
}
