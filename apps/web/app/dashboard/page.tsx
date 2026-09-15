import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { DashboardGrid } from './_components/dashboard-grid'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DashboardGrid />
    </Suspense>
  )
}
