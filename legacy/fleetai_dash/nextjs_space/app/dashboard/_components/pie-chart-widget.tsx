'use client'

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import { buildPalette } from '@/lib/widget-colors'

export function PieChartWidget({ data, colorScheme, colors }: { data: any[]; colorScheme?: string; colors?: string[] }) {
  const safeData = Array.isArray(data) ? data : []
  if (safeData.length === 0) return <div className="text-xs text-muted-foreground text-center">No data</div>

  const first = safeData[0] ?? {}
  const labelKey = Object.keys(first).find(k => typeof first[k] === 'string') ?? 'name'
  const valueKey = Object.keys(first).find(k => typeof first[k] === 'number') ?? 'value'

  const palette = buildPalette(safeData.length, { colors, colorScheme })
  const colorFor = (index: number, entry: any) => colors?.[index] ?? palette[index] ?? entry?.color

  // Explicit legend payload so the legend swatches always match the sector colors.
  const legendPayload = safeData.map((entry: any, index: number) => ({
    value: entry?.[labelKey] ?? `Item ${index + 1}`,
    type: 'circle' as const,
    id: `legend-${index}`,
    color: colorFor(index, entry),
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={safeData}
          cx="50%"
          cy="50%"
          innerRadius="40%"
          outerRadius="70%"
          dataKey={valueKey}
          nameKey={labelKey}
          paddingAngle={2}
          strokeWidth={0}
        >
          {safeData.map((entry: any, index: number) => (
            <Cell key={`cell-${index}`} fill={colorFor(index, entry)} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))', borderRadius: 8, fontSize: 11 }}
        />
        <Legend
          verticalAlign="top"
          wrapperStyle={{ fontSize: 11 }}
          payload={legendPayload}
        />
      </PieChart>
    </ResponsiveContainer>
  )
}
