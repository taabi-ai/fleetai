/**
 * @fleetai/widget-contracts — Frozen widget type/metric catalog + colour maps.
 *
 * Ported from legacy `lib/widget-meta.ts`, `lib/widget-colors.ts`,
 * `lib/mock-data.ts` (metric names) and `lib/types.ts`. The widget config
 * contract is FROZEN — see AGENTS.md rule 9. Do NOT rename keys or hex values.
 */

import { WidgetConfigSchema, WidgetTypeSchema, DataSourceSchema, ColorSchemeSchema } from '@fleetai/contracts';

export { WidgetConfigSchema, WidgetTypeSchema, DataSourceSchema, ColorSchemeSchema };

// ---------------------------------------------------------------------------
// Type / data-source labels (ported from legacy lib/widget-meta.ts)
// ---------------------------------------------------------------------------

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
  custom: 'Custom',
};

export const DATA_SOURCE_LABELS: Record<string, string> = {
  fleet: 'Fleet',
  tms: 'TMS',
  adas: 'ADAS',
  fuel: 'Fuel',
  ev: 'EV',
  weather: 'Weather',
  crm: 'CRM',
  dora: 'DORA',
  training: 'Training',
};

export function typeLabel(type?: string): string {
  return (type && WIDGET_TYPE_LABELS[type]) ?? (type ?? 'Widget');
}

// ---------------------------------------------------------------------------
// Colour maps (ported from legacy lib/widget-colors.ts — hex values FROZEN)
// ---------------------------------------------------------------------------

export const NAMED_SCHEMES: Record<string, string> = {
  blue: '#3B82F6',
  green: '#10B981',
  orange: '#F59E0B',
  purple: '#6366F1',
  red: '#EF4444',
  teal: '#14B8A6',
};

export const DEFAULT_PALETTE = [
  '#6366F1', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#14B8A6', '#EC4899', '#8B5CF6',
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHex(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v);
}

export function resolveColor(colorScheme?: string, fallback = '#6366F1'): string {
  if (!colorScheme) return fallback;
  if (isHex(colorScheme)) return colorScheme;
  return NAMED_SCHEMES[colorScheme] ?? fallback;
}

export function sanitizeColors(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out = input.filter(isHex) as string[];
  return out.length ? out : undefined;
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function buildPalette(count: number, opts: { colors?: string[]; colorScheme?: string } = {}): string[] {
  const explicit = sanitizeColors(opts.colors) ?? [];
  const hasBase = !!opts.colorScheme;
  const base = hasBase ? resolveColor(opts.colorScheme ?? undefined) : undefined;
  const result: string[] = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    const explicitColor = explicit[i];
    if (explicitColor) { result.push(explicitColor); continue; }
    if (base) {
      const [h, s, l] = hexToHsl(base);
      const t = count > 1 ? i / (count - 1) : 0;
      const light = Math.min(0.78, Math.max(0.34, l - 0.18 + t * 0.4));
      const hue = (h + (i * 12)) % 360;
      const sat = Math.min(0.9, Math.max(0.35, s));
      result.push(hslToHex(hue, sat, light));
    } else {
      const paletteColor = DEFAULT_PALETTE[i % DEFAULT_PALETTE.length];
      if (paletteColor) result.push(paletteColor);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Metric catalog (ported from legacy lib/mock-data.ts exports)
// ---------------------------------------------------------------------------

export const METRIC_CATALOG: Record<string, { dataSources: string[]; label: string }> = {
  // fleet / tms
  active_vehicles: { dataSources: ['fleet'], label: 'Active vehicles' },
  fleet_status_summary: { dataSources: ['fleet'], label: 'Fleet status summary' },
  driver_performance: { dataSources: ['fleet'], label: 'Driver performance' },
  top_routes: { dataSources: ['fleet'], label: 'Top routes' },
  fleet_alerts: { dataSources: ['fleet'], label: 'Fleet alerts' },
  fleet_utilization: { dataSources: ['fleet'], label: 'Fleet utilization' },
  vehicle_map: { dataSources: ['fleet'], label: 'Vehicle locations map' },
  shipment_status: { dataSources: ['tms'], label: 'Shipment status' },
  delivery_by_region: { dataSources: ['tms'], label: 'Delivery by region' },
  on_time_delivery_rate: { dataSources: ['tms'], label: 'On-time delivery rate' },
  avg_delivery_time_trend: { dataSources: ['tms'], label: 'Avg delivery time trend' },
  freight_cost_by_carrier: { dataSources: ['tms'], label: 'Freight cost by carrier' },
  pending_vs_completed: { dataSources: ['tms'], label: 'Pending vs completed' },
  on_time_kpi: { dataSources: ['tms'], label: 'On-time delivery KPI' },
  // adas
  adas_alert_summary: { dataSources: ['adas'], label: 'ADAS alert summary' },
  adas_alerts_trend: { dataSources: ['adas'], label: 'ADAS alerts trend' },
  harsh_braking: { dataSources: ['adas'], label: 'Harsh braking events' },
  lane_departure: { dataSources: ['adas'], label: 'Lane departure by driver' },
  collision_risk: { dataSources: ['adas'], label: 'Collision risk distribution' },
  safety_score: { dataSources: ['adas'], label: 'Safety score trend' },
  // fuel
  consumption_trend: { dataSources: ['fuel'], label: 'Fuel consumption trend' },
  fuel_efficiency_by_type: { dataSources: ['fuel'], label: 'Fuel efficiency by type' },
  fuel_theft_alerts: { dataSources: ['fuel'], label: 'Fuel theft alerts' },
  top_fuel_consumers: { dataSources: ['fuel'], label: 'Top fuel consumers' },
  idle_vs_fuel_waste: { dataSources: ['fuel'], label: 'Idle vs fuel waste' },
  fuel_level_kpi: { dataSources: ['fuel'], label: 'Avg fuel level KPI' },
  // ev
  ev_battery_status: { dataSources: ['ev'], label: 'EV battery status' },
  charging_sessions: { dataSources: ['ev'], label: 'Charging sessions' },
  soc_distribution: { dataSources: ['ev'], label: 'SoC distribution' },
  energy_vs_distance: { dataSources: ['ev'], label: 'Energy vs distance' },
  ev_kpi: { dataSources: ['ev'], label: 'Avg state of charge KPI' },
  range_anxiety_map: { dataSources: ['ev'], label: 'Range anxiety map' },
  // weather
  weather: { dataSources: ['weather'], label: 'Weather' },
};

export function metricCatalog(): Record<string, { dataSources: string[]; label: string }> {
  return METRIC_CATALOG;
}

export function isValidMetric(dataSource: string, metric: string): boolean {
  const entry = METRIC_CATALOG[metric];
  return !!entry && entry.dataSources.includes(dataSource);
}
