import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { requirePermission } from '@/lib/rbac'
import { SalesClient } from './_components/sales-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sales & CRM — FleetAI Dash' }

export default async function SalesPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!(await requirePermission('crm.view'))) redirect('/dashboard')
  const canManage = !!(await requirePermission('crm.manage'))
  return <SalesClient canManage={canManage} />
}
