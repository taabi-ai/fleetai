'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useTheme } from 'next-themes'

const STATUS_COLORS: Record<string, string> = {
  Active: '#10B981',
  'In Transit': '#3B82F6',
  Idle: '#6366F1',
  Maintenance: '#F59E0B',
  'Low Battery': '#EF4444',
}

export default function MapContent({ data, colorScheme }: { data: any[]; colorScheme?: string }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme !== 'light'

  useEffect(() => {
    if (!mapRef.current) return
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    const safeData = Array.isArray(data) ? data : []
    const center: [number, number] = safeData.length > 0
      ? [safeData[0]?.lat ?? 20.5, safeData[0]?.lng ?? 78.9]
      : [20.5, 78.9]

    const map = L.map(mapRef.current, {
      center,
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
    })

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
      className: isDark ? 'fleet-tiles-dark' : 'fleet-tiles-light',
    }).addTo(map)

    L.control.zoom({ position: 'topright' }).addTo(map)

    safeData.forEach((item: any) => {
      if (item?.lat == null || item?.lng == null) return
      const color = STATUS_COLORS[item?.status] ?? '#6366F1'
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid hsl(var(--background));box-shadow:0 0 8px ${color}80;"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      })

      L.marker([item.lat, item.lng], { icon })
        .addTo(map)
        .bindPopup(
          `<div style="font-size:12px;color:hsl(var(--popover-foreground));background:hsl(var(--popover));padding:8px;border-radius:8px;min-width:120px;">
            <b>${item?.id ?? 'N/A'}</b><br/>
            ${item?.driver ?? item?.location ?? ''}<br/>
            Status: <span style="color:${color}">${item?.status ?? 'Unknown'}</span><br/>
            ${item?.speed != null ? `Speed: ${item.speed} km/h<br/>` : ''}
            ${item?.soc != null ? `SoC: ${item.soc}%<br/>` : ''}
            ${item?.range != null ? `Range: ${item.range} km` : ''}
          </div>`,
          { className: 'custom-popup' }
        )
    })

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [data, colorScheme, isDark])

  return <div ref={mapRef} className="h-full w-full rounded-lg" style={{ minHeight: 200 }} />
}
