export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { auth } from '@/auth'
import { prisma } from '@/lib/db'
import { AI_UNLOCK_COOKIE, isAiUnlocked } from '@/lib/access'
import { roleHas } from '@/lib/rbac'
import { getActiveProvider, streamChat, extractJson, type UsageSink } from '@/lib/llm'
import { getQuotaStatus, recordUsage, estimateTokens } from '@/lib/usage'
import { audit } from '@/lib/audit'

const EDIT_MODE_PROMPT = `
EDIT MODE: The user is modifying an EXISTING widget. You will be given the current widget JSON.
Apply ONLY the changes the user asks for (e.g. change chart type, color, title, time range, metric, size, rows per page, per-item colors) and keep every other field exactly as it is.
If the user asks for a different data source or metric, pick the closest valid metric from the list above.
When the user asks to change the color/scheme, set "colorScheme" to the requested named scheme AND set "accentColor" to null (so the named scheme is not masked by a previous custom accent). Only set "accentColor" to a hex value when the user explicitly asks for a specific custom color for the whole widget.
When the user asks to color individual items (e.g. "make the first bar red and the second green", "color each slice differently"), set "colors" to an ordered array of hex strings, one per item.
When the user asks to change how many rows a table shows (e.g. "show 10 rows", "20 per page"), set "pageSize" to that number.
Return the COMPLETE updated widget JSON object (same schema), never a partial diff.
`

const SYSTEM_PROMPT = `You are a fleet management dashboard AI assistant. Your ONLY job is to return a valid JSON widget configuration when a user requests data visualization.

Available widget types:
- "line_chart": Time-series trends. Best for: fuel consumption over time, safety scores, delivery times, temperatures.
- "bar_chart": Comparisons. Best for: driver scores, freight costs, alert counts by type, fuel by vehicle.
- "pie_chart": Distributions. Best for: vehicle status, order status, alert categories, SoC distribution.
- "kpi_card": Single metric with value, change %, trend. Best for: active vehicles, on-time rate, avg SoC.
- "table": Paginated data table. Best for: driver performance list, alerts list, charging sessions, shipments.
- "map": Leaflet map with markers. Best for: vehicle locations, range anxiety alerts, depot locations.
- "weather": Real weather data widget. Use ONLY for weather-related requests.
- "gauge": Circular gauge 0-100. Best for: battery %, fuel level, utilization rate.
- "area_chart": Filled area chart. Best for: cumulative metrics, pending vs completed.

Available data sources and metrics:

FLEET (dataSource: "fleet"):
- vehicles: Full vehicle list (for tables)
- status_summary: Vehicle status distribution [Active/Idle/Maintenance/InTransit]
- driver_performance: Driver scores, trips, violations
- top_routes: Top routes by distance
- alerts: Fleet alerts (breakdown, geofence, speeding)
- utilization: Fleet utilization rate over time (param: days)
- active_vehicles: KPI - active vehicle count
- vehicle_map: Vehicle locations on map

TMS (dataSource: "tms"):
- shipment_status: Shipment status distribution
- delivery_by_region: Deliveries by region
- on_time_rate: On-time delivery rate trend (param: days)
- avg_delivery_time: Average delivery time trend (param: days)
- freight_cost: Freight cost by carrier
- pending_vs_completed: Pending vs completed orders (param: days)
- on_time_kpi: KPI - on-time delivery rate

ADAS (dataSource: "adas"):
- alert_summary: ADAS alert type summary
- alerts_trend: Alert counts over time (param: days)
- harsh_braking: Harsh braking events (param: days)
- lane_departure: Lane departure warnings by driver
- collision_risk: Collision risk distribution
- safety_score: Safety score trend (param: days)

FUEL (dataSource: "fuel"):
- consumption_trend: Fuel consumption over time (param: days)
- efficiency_by_type: Fuel efficiency by vehicle type
- theft_alerts: Fuel theft detection alerts
- top_consumers: Top 10 fuel consumers
- idle_vs_waste: Idle time vs fuel waste (param: days)
- fuel_level_kpi: KPI - average fuel level

EV (dataSource: "ev"):
- battery_status: Battery status across all EVs (table)
- charging_sessions: Charging session history (table)
- soc_distribution: State of charge distribution
- energy_vs_distance: Energy consumption vs distance
- ev_kpi: KPI - average SoC
- range_anxiety_map: Map of low-battery EVs

WEATHER (dataSource: "weather"):
- current: Current weather at a city (param: city)
- forecast: Weather forecast (param: city, days)

Color schemes: "blue", "green", "orange", "purple", "red", "teal"

Widget size guidelines (w x h in grid units, 12 columns):
- kpi_card: w=3, h=2
- line_chart/bar_chart/area_chart: w=6, h=4
- pie_chart: w=4, h=4
- table: w=8, h=4
- map: w=6, h=5
- weather: w=4, h=4
- gauge: w=3, h=3

RESPOND WITH ONLY A VALID JSON OBJECT. No explanation, no markdown, no code blocks.

JSON schema:
{
  "type": "line_chart|bar_chart|pie_chart|kpi_card|table|map|weather|gauge|area_chart",
  "title": "string",
  "dataSource": "fleet|tms|adas|fuel|ev|weather",
  "metric": "metric_name from above",
  "params": { "days": 7, "city": "Mumbai" },
  "colorScheme": "blue|green|orange|purple|red|teal",
  "accentColor": "#RRGGBB or null (optional; a custom color for the whole widget that overrides colorScheme; use null to clear it)",
  "colors": ["#RRGGBB", "..."],
  "pageSize": 8,
  "gridPos": { "w": 6, "h": 4 }
}

Notes on optional fields: omit "accentColor", "colors" and "pageSize" unless relevant. "colors" assigns a color to each item in order (bars, pie slices, table rows). "pageSize" only applies to tables (1-100 rows per page).

Examples:
User: "Show me fuel consumption trend for the last 7 days"
{"type":"line_chart","title":"Fuel Consumption - Last 7 Days","dataSource":"fuel","metric":"consumption_trend","params":{"days":7},"colorScheme":"orange","gridPos":{"w":6,"h":4}}

User: "Display driver performance scores table"
{"type":"table","title":"Driver Performance Scores","dataSource":"fleet","metric":"driver_performance","params":{},"colorScheme":"blue","gridPos":{"w":8,"h":4}}

User: "Current weather at Mumbai depot"
{"type":"weather","title":"Weather - Mumbai","dataSource":"weather","metric":"current","params":{"city":"Mumbai"},"colorScheme":"blue","gridPos":{"w":4,"h":4}}

User: "Show active vehicles on map"
{"type":"map","title":"Active Vehicles Map","dataSource":"fleet","metric":"vehicle_map","params":{},"colorScheme":"blue","gridPos":{"w":6,"h":5}}

User: "Fleet utilization rate this week"
{"type":"kpi_card","title":"Fleet Utilization Rate","dataSource":"fleet","metric":"active_vehicles","params":{},"colorScheme":"green","gridPos":{"w":3,"h":2}}

User: "Battery status across all EVs"
{"type":"table","title":"EV Battery Status","dataSource":"ev","metric":"battery_status","params":{},"colorScheme":"teal","gridPos":{"w":8,"h":4}}

EDIT User: "change the color to green" (current widget has colorScheme "blue", accentColor "#8844ff")
{...same widget...,"colorScheme":"green","accentColor":null}

EDIT User: "show 15 rows per page" (current widget is a table)
{...same widget...,"pageSize":15}

EDIT User: "color the bars red, green and blue" (current widget is a bar_chart)
{...same widget...,"colors":["#EF4444","#10B981","#3B82F6"]}
`;

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // RBAC: the role must hold the ai.use permission (configured at /admin/roles)
  if (!(await roleHas(session.user.role, 'ai.use'))) {
    return NextResponse.json({ error: 'Your role is not allowed to use the AI assistant. Ask an administrator for the ai.use permission.' }, { status: 403 })
  }

  // AI assistant PIN protection
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { aiPin: true } })
  const cookieStore = await cookies()
  if (!isAiUnlocked(cookieStore.get(AI_UNLOCK_COOKIE)?.value, session.user.id, user?.aiPin ?? null)) {
    return NextResponse.json({ error: 'AI Assistant is locked. Enter your PIN to continue.', pinRequired: true }, { status: 403 })
  }

  // Token quota (Admin → LLM usage & quotas)
  const quota = await getQuotaStatus(session.user.id)
  if (quota.exceeded && quota.hardLimit) {
    void audit({ action: 'ai.quota_blocked', entity: 'llm_usage', entityId: session.user.id, summary: `${session.user.email} blocked by token quota (${quota.used.toLocaleString('en-US')} / ${quota.limit.toLocaleString('en-US')})`, actor: { id: session.user.id, email: session.user.email, role: session.user.role }, status: 429 })
    return NextResponse.json({
      error: `You have used your monthly AI token quota (${quota.used.toLocaleString('en-US')} of ${quota.limit.toLocaleString('en-US')} tokens). Request more credits from the usage panel.`,
      quotaExceeded: true, quota,
    }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { prompt, mode, currentWidget } = body ?? {}
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }
    const isEdit = mode === 'edit' && currentWidget
    const systemPrompt = isEdit ? SYSTEM_PROMPT + EDIT_MODE_PROMPT : SYSTEM_PROMPT
    const userContent = isEdit
      ? `Current widget JSON:\n${JSON.stringify(currentWidget)}\n\nUser request: ${prompt}`
      : prompt

    const provider = await getActiveProvider()
    const encoder = new TextEncoder()
    const usage: UsageSink = {}
    const started = Date.now()
    const actor = { id: session.user.id, email: session.user.email, role: session.user.role }
    const feature = isEdit ? 'edit' : 'generate'
    const finish = async (ok: boolean, buffer: string, errorMessage?: string) => {
      const estimated = usage.promptTokens === undefined && usage.completionTokens === undefined
      const promptTokens = usage.promptTokens ?? estimateTokens(systemPrompt + userContent)
      const completionTokens = usage.completionTokens ?? estimateTokens(buffer)
      await recordUsage({ userId: session.user.id, providerId: provider.id, providerName: provider.name, model: provider.model, feature, promptTokens, completionTokens, estimated, success: ok, durationMs: Date.now() - started })
      await audit({
        action: `ai.${feature}`, entity: 'widget', entityId: isEdit ? (currentWidget?.id ?? null) : null,
        summary: `${session.user.email} ${ok ? (isEdit ? 'edited a widget with AI' : 'generated a widget with AI') : `AI ${feature} failed`} (${promptTokens + completionTokens} tokens, ${provider.model})`,
        actor, method: 'POST', path: '/api/ai/generate-widget', status: ok ? 200 : 500,
        payload: { prompt: String(prompt).slice(0, 500), mode: mode ?? 'create', widgetId: currentWidget?.id ?? null },
        result: { provider: provider.name, model: provider.model, promptTokens, completionTokens, estimated, ...(errorMessage ? { error: errorMessage } : {}) },
        durationMs: Date.now() - started,
      })
    }

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        let buffer = ''
        try {
          send({ status: 'processing', message: `Generating widget with ${provider.name}...` })
          for await (const delta of streamChat(provider, { system: systemPrompt, user: userContent, maxTokens: 600, temperature: 0.1, json: true }, usage)) {
            buffer += delta
            send({ status: 'processing', message: 'Generating widget...' })
          }
          try {
            const finalResult = extractJson(buffer)
            await finish(true, buffer)
            send({ status: 'completed', widget: finalResult, provider: provider.name, usage: { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens } })
          } catch {
            await finish(false, buffer, 'unparseable response')
            send({ status: 'error', message: 'Failed to parse AI response as a widget configuration' })
          }
        } catch (error: any) {
          await finish(false, buffer, error?.message ?? 'Stream error')
          send({ status: 'error', message: error?.message ?? 'Stream error' })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to generate widget' }, { status: 500 })
  }
}
