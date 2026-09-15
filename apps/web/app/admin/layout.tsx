import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { isSuperAdmin } from '@/lib/admin'
import { AdminShell } from './_components/admin-shell'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  if (!isSuperAdmin((session.user as any).role)) redirect('/dashboard')
  return <AdminShell>{children}</AdminShell>
}
