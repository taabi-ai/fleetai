export const WIDGET_TYPE_LABELS: Record<string, string> = {
  line_chart: 'Line chart',
  bar_chart: 'Bar chart',
  pie_chart: 'Pie chart',
  area_chart: 'Area chart',
  kpi_card: 'KPI card',
  table: 'Table',
  map: 'Map',
  weather: 'Weather',
  gauge: 'Gauge',
}

export const DATA_SOURCE_LABELS: Record<string, string> = {
  fleet: 'Fleet',
  tms: 'TMS',
  adas: 'ADAS',
  fuel: 'Fuel',
  ev: 'EV',
  weather: 'Weather',
}

export const WIDGET_TYPE_COLORS: Record<string, string> = {
  line_chart: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
  bar_chart: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/20',
  pie_chart: 'bg-pink-500/15 text-pink-300 border-pink-500/20',
  area_chart: 'bg-teal-500/15 text-teal-300 border-teal-500/20',
  kpi_card: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  table: 'bg-slate-500/15 text-slate-300 border-slate-500/20',
  map: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  weather: 'bg-sky-500/15 text-sky-300 border-sky-500/20',
  gauge: 'bg-violet-500/15 text-violet-300 border-violet-500/20',
}

export function typeLabel(type?: string) {
  return (type && WIDGET_TYPE_LABELS[type]) ?? (type ?? 'Widget')
}

export function typeColor(type?: string) {
  return (type && WIDGET_TYPE_COLORS[type]) ?? 'bg-white/5 text-muted-foreground border-white/10'
}

export function displayName(u?: { name?: string | null; email?: string | null } | null) {
  return u?.name ?? u?.email ?? 'Unknown user'
}
