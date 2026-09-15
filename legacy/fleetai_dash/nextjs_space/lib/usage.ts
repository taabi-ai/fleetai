import { prisma } from '@/lib/db'

/**
 * LLM token accounting: per-user monthly quotas, admin-granted bonus credits, credit requests.
 * Usage rows are written by the AI assistant route; quotas are evaluated before every call.
 */

export const SETTING_DEFAULT_MONTHLY = 'llm.defaultMonthlyTokens'
export const SETTING_WARN_PCT = 'llm.warnPercent'
const DEFAULT_MONTHLY_TOKENS = 200_000
const DEFAULT_WARN_PCT = 80

export function currentMonth(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
export function monthStart(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

export async function getPlatformDefaults() {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: [SETTING_DEFAULT_MONTHLY, SETTING_WARN_PCT] } } })
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  const monthly = Number(map[SETTING_DEFAULT_MONTHLY])
  const warn = Number(map[SETTING_WARN_PCT])
  return {
    defaultMonthlyTokens: Number.isFinite(monthly) && monthly >= 0 ? monthly : DEFAULT_MONTHLY_TOKENS,
    warnPercent: Number.isFinite(warn) && warn > 0 && warn <= 100 ? warn : DEFAULT_WARN_PCT,
  }
}

export async function setPlatformDefaults(v: { defaultMonthlyTokens?: number; warnPercent?: number }) {
  const ops = []
  if (v.defaultMonthlyTokens !== undefined) ops.push(prisma.platformSetting.upsert({ where: { key: SETTING_DEFAULT_MONTHLY }, update: { value: v.defaultMonthlyTokens }, create: { key: SETTING_DEFAULT_MONTHLY, value: v.defaultMonthlyTokens } }))
  if (v.warnPercent !== undefined) ops.push(prisma.platformSetting.upsert({ where: { key: SETTING_WARN_PCT }, update: { value: v.warnPercent }, create: { key: SETTING_WARN_PCT, value: v.warnPercent } }))
  await prisma.$transaction(ops)
}

export type QuotaStatus = {
  month: string
  used: number
  requests: number
  limit: number          // effective monthly limit incl. bonus (0 = unlimited)
  baseLimit: number
  bonus: number
  remaining: number      // Infinity represented as -1
  percent: number        // 0..100+ (0 when unlimited)
  hardLimit: boolean
  exceeded: boolean
  warn: boolean
  isCustom: boolean
}

/** Effective quota + usage for the current month. */
export async function getQuotaStatus(userId: string): Promise<QuotaStatus> {
  const month = currentMonth()
  const [defaults, quota, agg] = await Promise.all([
    getPlatformDefaults(),
    prisma.userQuota.findUnique({ where: { userId } }),
    prisma.llmUsage.aggregate({ where: { userId, createdAt: { gte: monthStart() } }, _sum: { totalTokens: true }, _count: { _all: true } }),
  ])
  const used = agg._sum.totalTokens ?? 0
  const baseLimit = quota?.monthlyLimit ?? defaults.defaultMonthlyTokens
  const bonus = quota && quota.bonusMonth === month ? quota.bonusTokens : 0
  const limit = baseLimit === 0 ? 0 : baseLimit + bonus
  const remaining = limit === 0 ? -1 : Math.max(0, limit - used)
  const percent = limit === 0 ? 0 : Math.round((used / limit) * 100)
  const hardLimit = quota?.hardLimit ?? true
  return {
    month, used, requests: agg._count._all, limit, baseLimit, bonus, remaining, percent, hardLimit,
    exceeded: limit !== 0 && used >= limit,
    warn: limit !== 0 && percent >= defaults.warnPercent,
    isCustom: !!quota && quota.monthlyLimit !== null,
  }
}

export async function recordUsage(input: {
  userId: string; providerId: string | null; providerName: string; model: string; feature: string
  promptTokens: number; completionTokens: number; estimated: boolean; success: boolean; durationMs?: number
}) {
  const totalTokens = Math.max(0, Math.round(input.promptTokens)) + Math.max(0, Math.round(input.completionTokens))
  try {
    await prisma.llmUsage.create({ data: { ...input, promptTokens: Math.round(input.promptTokens), completionTokens: Math.round(input.completionTokens), totalTokens } })
  } catch (e) {
    console.error('[usage] failed to record usage', (e as Error)?.message)
  }
}

/** Rough token estimate when the provider does not return usage (~4 chars per token). */
export function estimateTokens(text: string) {
  return Math.ceil((text ?? '').length / 4)
}

/** Adds bonus tokens to the current month (resets stale bonuses from earlier months). */
export async function grantBonus(userId: string, tokens: number, adminId: string, note?: string) {
  const month = currentMonth()
  const existing = await prisma.userQuota.findUnique({ where: { userId } })
  const carried = existing && existing.bonusMonth === month ? existing.bonusTokens : 0
  return prisma.userQuota.upsert({
    where: { userId },
    update: { bonusTokens: Math.max(0, carried + tokens), bonusMonth: month, updatedById: adminId, ...(note ? { note } : {}) },
    create: { userId, bonusTokens: Math.max(0, tokens), bonusMonth: month, updatedById: adminId, note: note ?? null },
  })
}
