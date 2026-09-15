export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'
import { AUDIENCES, LEVELS, canManageTraining, slugify } from '@/lib/training'

type Ctx = { params: Promise<{ id: string }> }

async function allowed() {
  const session = await auth()
  const user = session?.user
  return !!user?.id && (await canManageTraining(user.role))
}

export const PATCH = withAudit(async (req: Request, ctx: Ctx) => {
  if (!(await allowed())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (typeof body.slug === 'string' && body.slug.trim()) {
    const slug = slugify(body.slug)
    const clash = await prisma.trainingModule.findUnique({ where: { slug } })
    if (clash && clash.id !== id) return NextResponse.json({ error: 'Slug already in use' }, { status: 409 })
    data.slug = slug
  }
  if (body.description !== undefined) data.description = body.description ? String(body.description).slice(0, 2000) : null
  if ((AUDIENCES as readonly string[]).includes(body.audience)) data.audience = body.audience
  if ((LEVELS as readonly string[]).includes(body.level)) data.level = body.level
  if (typeof body.isPublished === 'boolean') data.isPublished = body.isPublished
  if (body.order !== undefined) data.order = Number(body.order) || 0
  if (body.coverAssetId !== undefined) data.coverAssetId = body.coverAssetId ? String(body.coverAssetId) : null
  const mod = await prisma.trainingModule.update({ where: { id }, data })
  return NextResponse.json({ module: mod })
}, { entity: 'training_module' })

export const DELETE = withAudit(async (_req: Request, ctx: Ctx) => {
  if (!(await allowed())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await ctx.params
  const exists = await prisma.trainingModule.findUnique({ where: { id }, select: { id: true } })
  if (!exists) return NextResponse.json({ error: 'Module not found' }, { status: 404 })
  await prisma.trainingModule.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}, { entity: 'training_module' })
