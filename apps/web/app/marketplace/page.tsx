import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { MarketplaceClient } from './_components/marketplace-client'

export const metadata = { title: 'Dashboard Marketplace — FleetAI Dash' }

export default async function MarketplacePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return <MarketplaceClient />
}
