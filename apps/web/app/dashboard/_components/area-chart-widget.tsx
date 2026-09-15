'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'

const COLOR_MAP: Record<string, string> = {
  blue: '#3B82F6', green: '#10B981', orange: '#F59E0B',
  purple: '#6366F1', red: '#EF4444', teal: '#14B8A6',
}

export function AreaChartWidget({ data, colorScheme }: { data: any[]; colorScheme?: string }) {
  const safeData = Array.isArray(data) ? data : []
  const color = colorScheme?.startsWith('#') ? colorScheme : (COLOR_MAP[colorScheme ?? 'blue'] ?? '#6366F1')
  if (safeData.length === 0) return <div className="text-xs text-muted-foreground text-center">No data</div>

  const first = safeData[0] ?? {}
  const xKey = Object.keys(first).find(k => typeof first[k] === 'string') ?? 'date'
  const numKeys = Object.keys(first).filter(k => typeof first[k] === 'number')

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={safeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          {numKeys.map((k, i) => {
            const c = i === 0 ? color : `hsl(${(i + 1) * 60}, 70%, 55%)`
            return (
              <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={c} stopOpacity={0.3} />
                <stop offset="95%" stopColor={c} stopOpacity={0} />
              </linearGradient>
            )
          })}
        </defs>
        <XAxis dataKey={xKey} tickLine={false} tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} axisLine={false} interval="preserveStartEnd" />
        <YAxis tickLine={false} tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} axisLine={false} width={40} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))', borderRadius: 8, fontSize: 11 }}
        />
        {numKeys.map((k, i) => {
          const c = i === 0 ? color : `hsl(${(i + 1) * 60}, 70%, 55%)`
          return <Area key={k} type="monotone" dataKey={k} stroke={c} fill={`url(#grad-${k})`} strokeWidth={2} />
        })}
      </AreaChart>
    </ResponsiveContainer>
  )
}
