'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts'

const COLOR_MAP: Record<string, string> = {
  blue: '#3B82F6', green: '#10B981', orange: '#F59E0B',
  purple: '#6366F1', red: '#EF4444', teal: '#14B8A6',
}

export function LineChartWidget({ data, colorScheme }: { data: any[]; colorScheme?: string }) {
  const safeData = Array.isArray(data) ? data : []
  const color = colorScheme?.startsWith('#') ? colorScheme : (COLOR_MAP[colorScheme ?? 'blue'] ?? '#6366F1')
  if (safeData.length === 0) return <div className="text-xs text-muted-foreground text-center">No data</div>

  // Determine keys - use first non-date numeric key
  const keys = Object.keys(safeData[0] ?? {}).filter(k => k !== 'date' && k !== 'name' && typeof (safeData[0] as any)?.[k] === 'number')
  const dataKey = keys[0] ?? 'value'

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={safeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <XAxis
          dataKey="date"
          tickLine={false}
          tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }}
          axisLine={false}
          tickFormatter={(v: string) => {
            const parts = (v ?? '').split('-')
            return `${parts?.[1] ?? ''}/${parts?.[2] ?? ''}`
          }}
          interval="preserveStartEnd"
        />
        <YAxis tickLine={false} tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} axisLine={false} width={40} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
          itemStyle={{ color }}
        />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color }} />
        {keys.length > 1 && keys.slice(1).map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={`hsl(${(i + 1) * 60}, 70%, 55%)`} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
