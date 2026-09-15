export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { withAudit } from '@/lib/audit'

// DELETE - remove own library widget
async function _DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const item = await prisma.libraryWidget.findFirst({ where: { id, ownerId: session.user.id } })
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.libraryWidget.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export const DELETE = withAudit(_DELETE, { entity: 'library_widget' })
