'use client'

import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip } from 'recharts'
import { resolveColor } from '@/lib/widget-colors'

export function BarChartWidget({ data, colorScheme, colors }: { data: any[]; colorScheme?: string; colors?: string[] }) {
  const safeData = Array.isArray(data) ? data : []
  const color = resolveColor(colorScheme)
  if (safeData.length === 0) return <div className="text-xs text-muted-foreground text-center">No data</div>

  const first = safeData[0] ?? {}
  const labelKey = Object.keys(first).find(k => typeof first[k] === 'string') ?? 'name'
  const numKeys = Object.keys(first).filter(k => typeof first[k] === 'number' && k !== 'id')
  const dataKey = numKeys[0] ?? 'value'

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={safeData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <XAxis
          dataKey={labelKey}
          tickLine={false}
          tick={{ fontSize: 9, fill: 'hsl(215 20% 55%)' }}
          axisLine={false}
          interval={0}
          angle={safeData.length > 6 ? -30 : 0}
          textAnchor={safeData.length > 6 ? 'end' : 'middle'}
          height={safeData.length > 6 ? 50 : 30}
          tickFormatter={(v: string) => (v ?? '').length > 12 ? (v ?? '').slice(0, 10) + '..' : (v ?? '')}
        />
        <YAxis tickLine={false} tick={{ fontSize: 10, fill: 'hsl(215 20% 55%)' }} axisLine={false} width={40} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))', borderRadius: 8, fontSize: 11 }}
          labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
        />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]}>
          {safeData.map((entry: any, i: number) => (
            <Cell key={`bar-cell-${i}`} fill={colors?.[i] ?? color} />
          ))}
        </Bar>
        {numKeys.length > 1 && numKeys.slice(1).map((k, i) => {
          const seriesColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#6366F1']
          return <Bar key={k} dataKey={k} fill={seriesColors[i % seriesColors.length] ?? '#6366F1'} radius={[4, 4, 0, 0]} />
        })}
      </BarChart>
    </ResponsiveContainer>
  )
}
