'use client'

import { useEffect, useState } from 'react'

const COLOR_MAP: Record<string, string> = {
  blue: '#3B82F6', green: '#10B981', orange: '#F59E0B',
  purple: '#6366F1', red: '#EF4444', teal: '#14B8A6',
}

export function GaugeWidget({ data, colorScheme }: { data: any; colorScheme?: string }) {
  const value = data?.value ?? 0
  const [animatedValue, setAnimatedValue] = useState(0)
  const color = colorScheme?.startsWith('#') ? colorScheme : (COLOR_MAP[colorScheme ?? 'green'] ?? '#10B981')

  useEffect(() => {
    const duration = 800
    const start = Date.now()
    const step = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimatedValue(Math.round(eased * value))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [value])

  const angle = (animatedValue / 100) * 270 - 135
  const radius = 60
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animatedValue / 100) * (circumference * 0.75)

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <svg viewBox="0 0 160 140" className="w-full max-w-[140px]">
        {/* Background arc */}
        <circle
          cx="80" cy="80" r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform="rotate(135 80 80)"
        />
        {/* Value arc */}
        <circle
          cx="80" cy="80" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(135 80 80)"
          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
        />
        <text x="80" y="78" textAnchor="middle" className="font-mono" fill={color} fontSize="24" fontWeight="bold">
          {animatedValue}%
        </text>
        <text x="80" y="96" textAnchor="middle" fill="hsl(215 20% 55%)" fontSize="10">
          {data?.label ?? 'Level'}
        </text>
      </svg>
    </div>
  )
}
