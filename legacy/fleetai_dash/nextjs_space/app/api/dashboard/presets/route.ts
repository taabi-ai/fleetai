export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { DASHBOARD_INCLUDE } from '@/lib/access'
import { withAudit } from '@/lib/audit'

const PRESETS: Record<string, { name: string; widgets: Array<{ widgetConfig: any; gridPos: any }> }> = {
  fleet_overview: {
    name: 'Fleet Operations Overview',
    widgets: [
      { widgetConfig: { type: 'kpi_card', title: 'Active Vehicles', dataSource: 'fleet', metric: 'active_vehicles', params: {}, colorScheme: 'green' }, gridPos: { x: 0, y: 0, w: 3, h: 2 } },
      { widgetConfig: { type: 'kpi_card', title: 'On-Time Delivery', dataSource: 'tms', metric: 'on_time_kpi', params: {}, colorScheme: 'blue' }, gridPos: { x: 3, y: 0, w: 3, h: 2 } },
      { widgetConfig: { type: 'kpi_card', title: 'Avg Fuel Level', dataSource: 'fuel', metric: 'fuel_level_kpi', params: {}, colorScheme: 'orange' }, gridPos: { x: 6, y: 0, w: 3, h: 2 } },
      { widgetConfig: { type: 'kpi_card', title: 'Avg EV SoC', dataSource: 'ev', metric: 'ev_kpi', params: {}, colorScheme: 'teal' }, gridPos: { x: 9, y: 0, w: 3, h: 2 } },
      { widgetConfig: { type: 'map', title: 'Vehicle Locations', dataSource: 'fleet', metric: 'vehicle_map', params: {}, colorScheme: 'blue' }, gridPos: { x: 0, y: 2, w: 6, h: 5 } },
      { widgetConfig: { type: 'pie_chart', title: 'Fleet Status', dataSource: 'fleet', metric: 'status_summary', params: {}, colorScheme: 'blue' }, gridPos: { x: 6, y: 2, w: 4, h: 4 } },
      { widgetConfig: { type: 'line_chart', title: 'Fuel Consumption - 7 Days', dataSource: 'fuel', metric: 'consumption_trend', params: { days: 7 }, colorScheme: 'orange' }, gridPos: { x: 0, y: 7, w: 6, h: 4 } },
      { widgetConfig: { type: 'bar_chart', title: 'Driver Performance', dataSource: 'fleet', metric: 'driver_performance', params: {}, colorScheme: 'purple' }, gridPos: { x: 6, y: 7, w: 6, h: 4 } },
    ],
  },
  safety_adas: {
    name: 'Safety & ADAS Report',
    widgets: [
      { widgetConfig: { type: 'bar_chart', title: 'ADAS Alert Summary', dataSource: 'adas', metric: 'alert_summary', params: {}, colorScheme: 'red' }, gridPos: { x: 0, y: 0, w: 6, h: 4 } },
      { widgetConfig: { type: 'pie_chart', title: 'Collision Risk Distribution', dataSource: 'adas', metric: 'collision_risk', params: {}, colorScheme: 'red' }, gridPos: { x: 6, y: 0, w: 4, h: 4 } },
      { widgetConfig: { type: 'line_chart', title: 'Safety Score - 30 Days', dataSource: 'adas', metric: 'safety_score', params: { days: 30 }, colorScheme: 'green' }, gridPos: { x: 0, y: 4, w: 6, h: 4 } },
      { widgetConfig: { type: 'bar_chart', title: 'Harsh Braking - 7 Days', dataSource: 'adas', metric: 'harsh_braking', params: { days: 7 }, colorScheme: 'orange' }, gridPos: { x: 6, y: 4, w: 6, h: 4 } },
      { widgetConfig: { type: 'table', title: 'Lane Departure by Driver', dataSource: 'adas', metric: 'lane_departure', params: {}, colorScheme: 'blue' }, gridPos: { x: 0, y: 8, w: 8, h: 4 } },
    ],
  },
  ev_monitor: {
    name: 'EV Fleet Monitor',
    widgets: [
      { widgetConfig: { type: 'kpi_card', title: 'Avg State of Charge', dataSource: 'ev', metric: 'ev_kpi', params: {}, colorScheme: 'teal' }, gridPos: { x: 0, y: 0, w: 3, h: 2 } },
      { widgetConfig: { type: 'gauge', title: 'Fleet Battery Level', dataSource: 'ev', metric: 'ev_kpi', params: {}, colorScheme: 'green' }, gridPos: { x: 3, y: 0, w: 3, h: 3 } },
      { widgetConfig: { type: 'pie_chart', title: 'SoC Distribution', dataSource: 'ev', metric: 'soc_distribution', params: {}, colorScheme: 'teal' }, gridPos: { x: 6, y: 0, w: 4, h: 4 } },
      { widgetConfig: { type: 'table', title: 'EV Battery Status', dataSource: 'ev', metric: 'battery_status', params: {}, colorScheme: 'blue' }, gridPos: { x: 0, y: 3, w: 6, h: 4 } },
      { widgetConfig: { type: 'area_chart', title: 'Energy vs Distance', dataSource: 'ev', metric: 'energy_vs_distance', params: {}, colorScheme: 'teal' }, gridPos: { x: 6, y: 4, w: 6, h: 4 } },
      { widgetConfig: { type: 'table', title: 'Charging Sessions', dataSource: 'ev', metric: 'charging_sessions', params: {}, colorScheme: 'purple' }, gridPos: { x: 0, y: 7, w: 8, h: 4 } },
    ],
  },
}

async function _POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { preset } = body ?? {}
  const presetData = PRESETS[preset]
  if (!presetData) {
    return NextResponse.json({ error: 'Unknown preset' }, { status: 400 })
  }

  const dashboard = await prisma.dashboard.create({
    data: {
      name: presetData.name,
      userId: session.user.id,
      widgets: {
        create: presetData.widgets.map((w: any) => ({
          widgetConfig: w.widgetConfig,
          gridPos: w.gridPos,
        })),
      },
    },
    include: DASHBOARD_INCLUDE,
  })

  return NextResponse.json(dashboard, { status: 201 })
}

export const POST = withAudit(_POST, { entity: 'dashboard', verbs: { POST: 'create_preset' } })
