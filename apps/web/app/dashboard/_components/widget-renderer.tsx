'use client'

import { useState, useEffect, useCallback } from 'react'
import { WidgetWrapper, type LockState } from './widget-wrapper'
import { sanitizeColors } from '@/lib/widget-colors'
import { KPICardWidget } from './kpi-card-widget'
import { LineChartWidget } from './line-chart-widget'
import { BarChartWidget } from './bar-chart-widget'
import { PieChartWidget } from './pie-chart-widget'
import { AreaChartWidget } from './area-chart-widget'
import { TableWidget } from './table-widget'
import { GaugeWidget } from './gauge-widget'
import { WeatherWidget } from './weather-widget'
import { MapWidget } from './map-widget'

export function WidgetRenderer({
  widget,
  onDelete,
  onDuplicate,
  onTitleChange,
  onEditWithAI,
  onToggleLock,
  onPublish,
  onSettings,
  lock,
  focused,
}: {
  widget: any
  onSettings?: () => void
  onDelete: () => void
  onDuplicate: () => void
  onTitleChange: (title: string) => void
  onEditWithAI?: () => void
  onToggleLock?: () => void
  onPublish?: () => void
  lock?: LockState
  focused?: boolean
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const config = widget?.widgetConfig ?? {}
  const { type, title, dataSource, metric, params, accentColor, refreshSec, mcpLink, mcpServerName } = config
  const accentOverride: string | undefined = typeof accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : undefined
  const colorScheme: string | undefined = accentOverride ?? config.colorScheme
  const itemColors: string[] | undefined = sanitizeColors(config.colors)
  const pageSize: number | undefined = Number.isFinite(Number(config.pageSize)) && Number(config.pageSize) > 0 ? Math.min(100, Math.floor(Number(config.pageSize))) : undefined
  const paramsKey = JSON.stringify(params ?? {})

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/widgets/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataSource, metric, params: JSON.parse(paramsKey) }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData?.error ?? 'Failed to load data')
      }
      const result = await res.json()
      setData(result)
    } catch (err: any) {
      setError(err?.message ?? 'Error loading data')
    } finally {
      setLoading(false)
    }
  }, [dataSource, metric, paramsKey])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const sec = Number(refreshSec)
    if (!sec || sec < 5) return
    const t = setInterval(() => { fetchData() }, sec * 1000)
    return () => clearInterval(t)
  }, [refreshSec, fetchData])

  const renderContent = () => {
    switch (type) {
      case 'kpi_card':
        return <KPICardWidget data={data} colorScheme={colorScheme} dataSource={dataSource} />
      case 'line_chart':
        return <LineChartWidget data={data} colorScheme={colorScheme} />
      case 'bar_chart':
        return <BarChartWidget data={data} colorScheme={colorScheme} colors={itemColors} />
      case 'pie_chart':
        return <PieChartWidget data={data} colorScheme={colorScheme} colors={itemColors} />
      case 'area_chart':
        return <AreaChartWidget data={data} colorScheme={colorScheme} />
      case 'table':
        return <TableWidget data={data} colorScheme={colorScheme} colors={itemColors} pageSize={pageSize} />
      case 'gauge':
        return <GaugeWidget data={data} colorScheme={colorScheme} />
      case 'weather':
        return <WeatherWidget data={data} />
      case 'map':
        return <MapWidget data={data} colorScheme={colorScheme} />
      default:
        return <div className="text-xs text-muted-foreground">Unknown widget type: {type}</div>
    }
  }

  return (
    <WidgetWrapper
      title={title ?? 'Widget'}
      colorScheme={config.colorScheme}
      accentOverride={accentOverride}
      mcpLink={typeof mcpLink === 'string' && /^https?:\/\//.test(mcpLink) ? mcpLink : undefined}
      mcpServerName={mcpServerName}
      onSettings={onSettings}
      onDelete={onDelete}
      onRefresh={fetchData}
      onDuplicate={onDuplicate}
      onTitleChange={onTitleChange}
      onEditWithAI={onEditWithAI}
      onToggleLock={onToggleLock}
      onPublish={onPublish}
      lock={lock}
      focused={focused}
      loading={loading}
      error={error}
    >
      {renderContent()}
    </WidgetWrapper>
  )
}
