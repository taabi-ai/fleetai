'use client'

import { useEffect, useState, useRef } from 'react'
import { TrendingUp, TrendingDown, Activity, Truck, Gauge, Battery, Fuel, Shield } from 'lucide-react'

const COLOR_MAP: Record<string, string> = {
  blue: '#3B82F6', green: '#10B981', orange: '#F59E0B',
  purple: '#6366F1', red: '#EF4444', teal: '#14B8A6',
}

const ICON_MAP: Record<string, any> = {
  fleet: Truck, tms: Activity, adas: Shield,
  fuel: Fuel, ev: Battery, default: Gauge,
}

export function KPICardWidget({ data, colorScheme, dataSource }: { data: any; colorScheme?: string; dataSource?: string }) {
  const [displayValue, setDisplayValue] = useState(0)
  const targetRef = useRef(data?.value ?? 0)
  const color = colorScheme?.startsWith('#') ? colorScheme : (COLOR_MAP[colorScheme ?? 'blue'] ?? '#6366F1')
  const Icon = ICON_MAP[dataSource ?? 'default'] ?? Gauge
  const change = data?.change ?? 0
  const isPositive = change >= 0

  useEffect(() => {
    targetRef.current = data?.value ?? 0
    let start = 0
    const target = targetRef.current
    const duration = 800
    const startTime = Date.now()
    const step = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(start + (target - start) * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [data?.value])

  return (
    <div className="h-full flex flex-col justify-center gap-1">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        <span className="text-xs text-muted-foreground">{data?.label ?? 'Metric'}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-mono font-bold" style={{ color }}>{displayValue}</span>
        <span className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {Math.abs(change).toFixed(1)}%
        </span>
      </div>
    </div>
  )
}
