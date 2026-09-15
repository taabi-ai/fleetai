import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { TrainingHome } from './_components/training-home'

export const metadata = { title: 'Training — FleetAI Dash' }

export default async function TrainingPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <TrainingHome />
}
