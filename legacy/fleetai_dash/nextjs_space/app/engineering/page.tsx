import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/rbac'
import { EngineeringClient } from './_components/engineering-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Engineering — DORA metrics — FleetAI Dash' }

export default async function EngineeringPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!(await requirePermission('dora.view'))) redirect('/dashboard')
  const canManage = !!(await requirePermission('dora.manage'))
  return <EngineeringClient canManage={canManage} />
}
