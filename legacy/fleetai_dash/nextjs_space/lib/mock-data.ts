// Fleet dashboard data layer.
// Every widget metric is aggregated LIVE from the database (see prisma models
// Vehicle, Driver, Route, Trip, AdasEvent, ChargingSession, FleetAlert, DailyStat).
// Data is provisioned by scripts/seed.ts -> scripts/seed-fleet.ts. No random data.
// Return shapes are intentionally identical to the previous mock generators so the
// widget renderer, charts and legends keep working unchanged.

import { prisma } from '@/lib/db'

const VEHICLE_TYPES = ['Truck', 'Van', 'Car', 'Bus', 'Trailer']
const CARRIERS = ['BlueDart Express', 'Delhivery', 'Gati Logistics', 'TCI Freight', 'Rivigo', 'Ecom Express']
const ADAS_TYPES = ['Harsh Braking', 'Lane Departure', 'Collision Warning', 'Speeding', 'Fatigue']
const REGIONS = ['North', 'South', 'East', 'West', 'Central']

const STATUS_COLORS: Record<string, string> = {
  Active: '#10B981', Idle: '#6366F1', Maintenance: '#F59E0B', 'In Transit': '#3B82F6',
}
const SHIPMENT_COLORS: Record<string, string> = {
  Delivered: '#10B981', 'In Transit': '#3B82F6', Pending: '#F59E0B', Failed: '#EF4444',
}
const ADAS_COLORS: Record<string, string> = {
  'Harsh Braking': '#EF4444', 'Lane Departure': '#F59E0B', 'Collision Warning': '#3B82F6', Speeding: '#6366F1', Fatigue: '#10B981',
}
const SEVERITY_COLORS: Record<string, string> = { Low: '#10B981', Medium: '#F59E0B', High: '#EF4444' }

function fmt(d: Date): string {
  return d.toISOString().split('T')[0] ?? ''
}

// Most recent N daily-stat rows, oldest-first (drives every trend widget and never
// empties as time passes, regardless of when the platform was seeded).
async function recentDaily(days: number) {
  const rows = await prisma.dailyStat.findMany({ orderBy: { day: 'desc' }, take: Math.max(1, days) })
  return rows.reverse()
}

// Period-over-period change for a KPI, from the two most recent daily rows.
async function dailyDelta(field: string): Promise<number> {
  const rows = await prisma.dailyStat.findMany({ orderBy: { day: 'desc' }, take: 2 })
  if (rows.length < 2) return 0
  const a = (rows[0] as any)[field] ?? 0
  const b = (rows[1] as any)[field] ?? 0
  return Math.round((a - b) * 10) / 10
}

// ===================== FLEET =====================
export async function getFleetVehicles() {
  const vs = await prisma.vehicle.findMany({ where: { isEv: false }, orderBy: { code: 'asc' } })
  return vs.map(v => ({
    id: v.code,
    type: v.type,
    status: v.status,
    driver: v.driverName,
    location: { name: v.cityName, lat: v.lat, lng: v.lng },
    fuelLevel: v.fuelLevel,
    speed: v.speed,
    lastUpdate: v.lastSeenAt.toISOString(),
  }))
}

export async function getFleetStatusSummary() {
  const rows = await prisma.vehicle.groupBy({ by: ['status'], where: { isEv: false }, _count: { status: true } })
  const order = ['Active', 'Idle', 'Maintenance', 'In Transit']
  return order.map(s => ({
    status: s,
    count: rows.find(r => r.status === s)?._count.status ?? 0,
    color: STATUS_COLORS[s] ?? '#6366F1',
  }))
}

export async function getDriverPerformance() {
  const ds = await prisma.driver.findMany({ orderBy: { name: 'asc' } })
  return ds.map(d => ({
    name: d.name,
    score: d.safetyScore,
    trips: d.trips,
    violations: d.violations,
    onTimeRate: d.onTimeRate,
  }))
}

export async function getTopRoutes() {
  const rs = await prisma.route.findMany()
  return rs.map(r => ({
    from: r.fromCity,
    to: r.toCity,
    distance: r.distanceKm,
    route: `${r.fromCity} \u2192 ${r.toCity}`,
    avgTime: r.avgTimeHours,
    trips: r.tripCount,
  })).sort((a, b) => b.distance - a.distance)
}

export async function getFleetAlerts() {
  const as = await prisma.fleetAlert.findMany({ where: { type: { not: 'Fuel Theft' } }, orderBy: { occurredAt: 'desc' } })
  return as.map(a => ({
    id: a.code,
    type: a.type,
    vehicle: a.vehicleCode,
    severity: a.severity,
    time: a.occurredAt.toISOString(),
    location: a.cityName ?? 'Unknown',
  }))
}

export async function getFleetUtilization(days: number = 7) {
  const rows = await recentDaily(days)
  return rows.map(r => ({ date: fmt(r.day), utilization: r.utilizationPct }))
}

export async function getActiveVehicleCount() {
  const value = await prisma.vehicle.count({ where: { isEv: false, status: { in: ['Active', 'In Transit'] } } })
  return { value, change: await dailyDelta('utilizationPct'), label: 'Active Vehicles' }
}

// ===================== TMS =====================
export async function getShipmentStatus() {
  const rows = await prisma.trip.groupBy({ by: ['status'], _count: { status: true } })
  const order = ['Delivered', 'In Transit', 'Pending', 'Failed']
  return order.map(s => ({
    status: s,
    count: rows.find(r => r.status === s)?._count.status ?? 0,
    color: SHIPMENT_COLORS[s] ?? '#3B82F6',
  }))
}

export async function getDeliveryByRegion() {
  const rows = await prisma.trip.groupBy({ by: ['region', 'status'], _count: { _all: true } })
  return REGIONS.map(r => {
    const forR = rows.filter(x => x.region === r)
    const get = (s: string) => forR.find(x => x.status === s)?._count._all ?? 0
    return { region: r, delivered: get('Delivered'), pending: get('Pending'), failed: get('Failed') }
  })
}

export async function getOnTimeDeliveryRate(days: number = 30) {
  const rows = await recentDaily(days)
  return rows.map(r => ({ date: fmt(r.day), rate: r.onTimeRate }))
}

export async function getAvgDeliveryTimeTrend(days: number = 30) {
  const rows = await recentDaily(days)
  return rows.map(r => ({ date: fmt(r.day), hours: r.avgDeliveryHours }))
}

export async function getFreightCostByCarrier() {
  const rows = await prisma.trip.groupBy({ by: ['carrier'], _sum: { costInr: true }, _count: { _all: true } })
  return CARRIERS.map(c => {
    const r = rows.find(x => x.carrier === c)
    return { carrier: c, cost: r?._sum.costInr ?? 0, shipments: r?._count._all ?? 0 }
  })
}

export async function getPendingVsCompleted(days: number = 14) {
  const rows = await recentDaily(days)
  return rows.map(r => ({ date: fmt(r.day), completed: r.tmsCompleted, pending: r.tmsPending }))
}

export async function getOnTimeDeliveryKPI() {
  const latest = await prisma.dailyStat.findFirst({ orderBy: { day: 'desc' } })
  return { value: latest?.onTimeRate ?? 0, change: await dailyDelta('onTimeRate'), label: 'On-Time Delivery %' }
}

// ===================== ADAS =====================
export async function getAdasAlertSummary() {
  const rows = await prisma.adasEvent.groupBy({ by: ['type'], _count: { _all: true } })
  return ADAS_TYPES.map(t => ({
    type: t,
    count: rows.find(r => r.type === t)?._count._all ?? 0,
    color: ADAS_COLORS[t] ?? '#6366F1',
  }))
}

export async function getAdasAlertsTrend(days: number = 30) {
  const rows = await recentDaily(days)
  return rows.map(r => ({
    date: fmt(r.day),
    'Harsh Braking': r.adasHarshBraking,
    'Lane Departure': r.adasLaneDeparture,
    'Collision Warning': r.adasCollisionWarning,
    Speeding: r.adasSpeeding,
    Fatigue: r.adasFatigue,
  }))
}

export async function getHarshBrakingEvents(days: number = 7) {
  const rows = await recentDaily(days)
  return rows.map(r => ({ date: fmt(r.day), events: r.adasHarshBraking }))
}

export async function getLaneDepartureByDriver() {
  const rows = await prisma.adasEvent.groupBy({ by: ['driverName'], where: { type: 'Lane Departure' }, _count: { _all: true } })
  return rows
    .filter(r => r.driverName)
    .map(r => ({ driver: r.driverName as string, warnings: r._count._all }))
    .sort((a, b) => b.warnings - a.warnings)
    .slice(0, 10)
}

export async function getCollisionRiskDistribution() {
  const rows = await prisma.adasEvent.groupBy({ by: ['severity'], _count: { _all: true } })
  return ['Low', 'Medium', 'High'].map(l => ({
    level: l,
    count: rows.find(r => r.severity === l)?._count._all ?? 0,
    color: SEVERITY_COLORS[l] ?? '#3B82F6',
  }))
}

export async function getSafetyScoreTrend(days: number = 30) {
  const rows = await recentDaily(days)
  return rows.map(r => ({ date: fmt(r.day), score: r.safetyScore }))
}

// ===================== FUEL =====================
export async function getFuelConsumptionTrend(days: number = 7) {
  const rows = await recentDaily(days)
  return rows.map(r => ({ date: fmt(r.day), consumption: r.fuelConsumptionL }))
}

export async function getFuelEfficiencyByType() {
  const rows = await prisma.vehicle.groupBy({ by: ['type'], where: { isEv: false }, _avg: { efficiency: true } })
  return VEHICLE_TYPES.map(t => ({
    type: t,
    efficiency: Math.round((rows.find(r => r.type === t)?._avg.efficiency ?? 0) * 10) / 10,
  }))
}

export async function getFuelTheftAlerts() {
  const rows = await prisma.fleetAlert.findMany({ where: { type: 'Fuel Theft' }, orderBy: { occurredAt: 'desc' } })
  return rows.map(a => ({
    id: a.code,
    vehicle: a.vehicleCode,
    location: a.cityName ?? 'Unknown',
    drop: a.dropPct ?? 0,
    time: a.occurredAt.toISOString(),
  }))
}

export async function getTopFuelConsumers() {
  const vs = await prisma.vehicle.findMany({ where: { isEv: false }, orderBy: { totalFuelL: 'desc' }, take: 10 })
  return vs.map(v => ({ vehicle: v.code, type: v.type, consumption: v.totalFuelL, driver: v.driverName }))
}

export async function getIdleVsFuelWaste(days: number = 7) {
  const rows = await recentDaily(days)
  return rows.map(r => ({ date: fmt(r.day), idleHours: r.fuelIdleHours, fuelWaste: r.fuelWasteL }))
}

export async function getFuelLevelKPI() {
  const agg = await prisma.vehicle.aggregate({ where: { isEv: false }, _avg: { fuelLevel: true } })
  return { value: Math.round(agg._avg.fuelLevel ?? 0), change: await dailyDelta('avgFuelLevel'), label: 'Avg Fuel Level %' }
}

// ===================== EV =====================
export async function getEvBatteryStatus() {
  const vs = await prisma.vehicle.findMany({ where: { isEv: true }, orderBy: { code: 'asc' } })
  return vs.map(v => ({ id: v.code, soc: v.soc ?? 0, range: v.rangeKm ?? 0, status: v.status, location: v.cityName }))
}

export async function getChargingSessions() {
  const rows = await prisma.chargingSession.findMany({ orderBy: { startTime: 'desc' }, take: 20 })
  return rows.map(c => ({ depot: c.depot, vehicle: c.vehicleCode, duration: c.durationMin, energy: c.energyKwh, startTime: c.startTime.toISOString() }))
}

export async function getSocDistribution() {
  const vs = await prisma.vehicle.findMany({ where: { isEv: true }, select: { soc: true } })
  const buckets = [
    { range: '0-20%', color: '#EF4444', min: 0, max: 20 },
    { range: '21-40%', color: '#F59E0B', min: 21, max: 40 },
    { range: '41-60%', color: '#3B82F6', min: 41, max: 60 },
    { range: '61-80%', color: '#6366F1', min: 61, max: 80 },
    { range: '81-100%', color: '#10B981', min: 81, max: 100 },
  ]
  return buckets.map(b => ({
    range: b.range,
    count: vs.filter(v => (v.soc ?? 0) >= b.min && (v.soc ?? 0) <= b.max).length,
    color: b.color,
  }))
}

export async function getEnergyVsDistance() {
  const vs = await prisma.vehicle.findMany({ where: { isEv: true }, orderBy: { code: 'asc' } })
  return vs.map(v => ({ vehicle: v.code, distance: v.evDistanceKm ?? 0, energy: v.evEnergyKwh ?? 0 }))
}

export async function getEvKPI() {
  const agg = await prisma.vehicle.aggregate({ where: { isEv: true }, _avg: { soc: true } })
  return { value: Math.round(agg._avg.soc ?? 0), change: await dailyDelta('avgSoc'), label: 'Avg SoC %' }
}

// ===================== MAP DATA =====================
export async function getVehicleMapData() {
  const vs = await prisma.vehicle.findMany({ where: { isEv: false }, take: 50, orderBy: { code: 'asc' } })
  return vs.map(v => ({
    id: v.code,
    lat: v.lat,
    lng: v.lng,
    type: v.type,
    status: v.status,
    driver: v.driverName,
    speed: v.speed,
    city: v.cityName,
  }))
}

export async function getRangeAnxietyMap() {
  const vs = await prisma.vehicle.findMany({ where: { isEv: true, soc: { lt: 30 } } })
  return vs.map(v => ({ id: v.code, lat: v.lat, lng: v.lng, soc: v.soc ?? 0, range: v.rangeKm ?? 0, location: v.cityName }))
}

// ===================== GENERIC METRIC RESOLVER =====================
export async function resolveMetricData(dataSource: string, metric: string, params?: any): Promise<any> {
  const days = params?.days ?? 7
  const lookup: Record<string, Record<string, () => Promise<any>>> = {
    fleet: {
      vehicles: getFleetVehicles,
      status_summary: getFleetStatusSummary,
      driver_performance: getDriverPerformance,
      top_routes: getTopRoutes,
      alerts: getFleetAlerts,
      utilization: () => getFleetUtilization(days),
      active_vehicles: getActiveVehicleCount,
      vehicle_map: getVehicleMapData,
    },
    tms: {
      shipment_status: getShipmentStatus,
      delivery_by_region: getDeliveryByRegion,
      on_time_rate: () => getOnTimeDeliveryRate(days),
      avg_delivery_time: () => getAvgDeliveryTimeTrend(days),
      freight_cost: getFreightCostByCarrier,
      pending_vs_completed: () => getPendingVsCompleted(days),
      on_time_kpi: getOnTimeDeliveryKPI,
    },
    adas: {
      alert_summary: getAdasAlertSummary,
      alerts_trend: () => getAdasAlertsTrend(days),
      harsh_braking: () => getHarshBrakingEvents(days),
      lane_departure: getLaneDepartureByDriver,
      collision_risk: getCollisionRiskDistribution,
      safety_score: () => getSafetyScoreTrend(days),
    },
    fuel: {
      consumption_trend: () => getFuelConsumptionTrend(days),
      efficiency_by_type: getFuelEfficiencyByType,
      theft_alerts: getFuelTheftAlerts,
      top_consumers: getTopFuelConsumers,
      idle_vs_waste: () => getIdleVsFuelWaste(days),
      fuel_level_kpi: getFuelLevelKPI,
    },
    ev: {
      battery_status: getEvBatteryStatus,
      charging_sessions: getChargingSessions,
      soc_distribution: getSocDistribution,
      energy_vs_distance: getEnergyVsDistance,
      ev_kpi: getEvKPI,
      range_anxiety_map: getRangeAnxietyMap,
    },
  }
  const sourceLookup = lookup[dataSource]
  if (!sourceLookup) return null
  const fn = sourceLookup[metric]
  return fn ? await fn() : null
}
