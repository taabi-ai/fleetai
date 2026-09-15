import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { LibraryClient } from './_components/library-client'

export const metadata = { title: 'Widget Library — FleetAI Dash' }

export default async function LibraryPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <LibraryClient />
}
