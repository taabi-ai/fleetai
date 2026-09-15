export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getMenuForRole } from '@/lib/menu'

// GET - navigation items visible to the current user's role
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const items = await getMenuForRole(session.user.role)
  return NextResponse.json(items.map(i => ({ id: i.id, label: i.label, path: i.path, icon: i.icon, isExternal: i.isExternal })))
}
