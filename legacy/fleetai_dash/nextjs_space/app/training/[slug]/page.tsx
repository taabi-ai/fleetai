import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { ModulePlayer } from '../_components/module-player'

export const metadata = { title: 'Training module — FleetAI Dash' }

export default async function TrainingModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { slug } = await params
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ModulePlayer slug={slug} />
    </Suspense>
  )
}
