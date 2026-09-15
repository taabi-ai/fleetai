'use client'

import dynamic from 'next/dynamic'

const MapContent = dynamic(() => import('./map-content'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  ),
})

export function MapWidget({ data, colorScheme }: { data: any[]; colorScheme?: string }) {
  return <MapContent data={data} colorScheme={colorScheme} />
}
