import { PrismaClient } from '@prisma/client'

// Deterministic PRNG (mulberry32) so seeded fleet data is stable & reproducible
// across every environment (Azure VM, AWS, local). Same seed => same data.
function mulberry32(seed: number) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20260907)
function rand(min: number, max: number) { return rng() * (max - min) + min }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)) }
function pick<T>(arr: T[]): T { return arr[Math.floor(rng() * arr.length)]! }
function normalRand(mean: number, stdDev: number) {
  const u1 = rng() || 1e-9
  const u2 = rng()
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

const VEHICLE_TYPES = ['Truck', 'Van', 'Car', 'Bus', 'Trailer']
const CARRIERS = ['BlueDart Express', 'Delhivery', 'Gati Logistics', 'TCI Freight', 'Rivigo', 'Ecom Express']
const REGIONS = ['North', 'South', 'East', 'West', 'Central']
const ADAS_TYPES = ['Harsh Braking', 'Lane Departure', 'Collision Warning', 'Speeding', 'Fatigue']
const SEVERITIES = ['Low', 'Medium', 'High']
const DEPOTS = ['Mumbai Depot', 'Delhi Hub', 'Bangalore Center', 'Chennai Port', 'Pune Yard', 'Hyderabad Dock', 'Kolkata Bay', 'Ahmedabad Station']
const INDIAN_CITIES = [
  { name: 'Mumbai', lat: 19.076, lng: 72.877 },
  { name: 'Delhi', lat: 28.644, lng: 77.216 },
  { name: 'Bangalore', lat: 12.971, lng: 77.594 },
  { name: 'Chennai', lat: 13.082, lng: 80.270 },
  { name: 'Hyderabad', lat: 17.385, lng: 78.486 },
  { name: 'Pune', lat: 18.520, lng: 73.856 },
  { name: 'Kolkata', lat: 22.572, lng: 88.363 },
  { name: 'Ahmedabad', lat: 23.022, lng: 72.571 },
]
const DRIVER_NAMES = [
  'Rajesh Kumar', 'Amit Sharma', 'Vijay Singh', 'Suresh Patel', 'Manoj Yadav',
  'Ravi Verma', 'Arun Gupta', 'Deepak Joshi', 'Sanjay Mishra', 'Prakash Reddy',
  'Ashok Nair', 'Ramesh Iyer', 'Sunil Tiwari', 'Anil Chauhan', 'Kiran Desai',
]
const ROUTES = [
  { from: 'Mumbai', to: 'Delhi', distance: 1420 },
  { from: 'Delhi', to: 'Bangalore', distance: 2150 },
  { from: 'Chennai', to: 'Hyderabad', distance: 630 },
  { from: 'Pune', to: 'Kolkata', distance: 1880 },
  { from: 'Mumbai', to: 'Ahmedabad', distance: 524 },
  { from: 'Delhi', to: 'Kolkata', distance: 1530 },
  { from: 'Bangalore', to: 'Chennai', distance: 350 },
  { from: 'Hyderabad', to: 'Pune', distance: 560 },
]
const EFFICIENCY_BY_TYPE: Record<string, [number, number]> = {
  Truck: [15, 22], Van: [10, 15], Car: [7, 12], Bus: [18, 30], Trailer: [25, 45],
}

function midnightDaysAgo(daysAgo: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d
}
function msDaysAgo(maxDaysAgo: number): Date {
  return new Date(Date.now() - Math.floor(rand(0, maxDaysAgo * 86400000)))
}

// Run upserts in small parallel batches (stays well under the DB connection cap).
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<any>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn))
  }
}

export async function seedFleet(prisma: PrismaClient) {
  // ---------- Drivers ----------
  const drivers = DRIVER_NAMES.map((name) => ({
    name,
    safetyScore: Math.max(50, Math.min(100, Math.round(normalRand(82, 8)))),
    trips: randInt(20, 60),
    violations: randInt(0, 5),
    onTimeRate: Math.round(rand(85, 99)),
  }))
  await inBatches(drivers, 10, (d) =>
    prisma.driver.upsert({ where: { name: d.name }, update: d, create: d })
  )

  // ---------- Routes ----------
  const routes = ROUTES.map((r) => ({
    fromCity: r.from,
    toCity: r.to,
    distanceKm: r.distance,
    avgTimeHours: Math.round(r.distance / rand(45, 65)),
    tripCount: randInt(15, 80),
  }))
  await inBatches(routes, 8, (r) =>
    prisma.route.upsert({
      where: { fromCity_toCity: { fromCity: r.fromCity, toCity: r.toCity } },
      update: r,
      create: r,
    })
  )

  // ---------- Vehicles: 150 combustion + 30 EV ----------
  const vehicles: any[] = []
  for (let i = 0; i < 150; i++) {
    const city = pick(INDIAN_CITIES)
    const roll = rng()
    let status = 'Idle'
    if (roll < 0.33) status = 'Active'
    else if (roll < 0.46) status = 'Maintenance'
    else if (roll < 0.53) status = 'In Transit'
    const type = pick(VEHICLE_TYPES)
    const [emin, emax] = EFFICIENCY_BY_TYPE[type] ?? [10, 20]
    vehicles.push({
      code: `VH-${String(i + 1).padStart(4, '0')}`,
      type,
      status,
      isEv: false,
      fuelLevel: randInt(10, 100),
      speed: status === 'Active' || status === 'In Transit' ? randInt(20, 90) : 0,
      efficiency: Math.round(rand(emin, emax) * 10) / 10,
      totalFuelL: randInt(300, 800),
      driverName: pick(DRIVER_NAMES),
      cityName: city.name,
      lat: city.lat + rand(-0.05, 0.05),
      lng: city.lng + rand(-0.05, 0.05),
      lastSeenAt: msDaysAgo(0.04),
    })
  }
  for (let i = 0; i < 30; i++) {
    const city = pick(INDIAN_CITIES)
    vehicles.push({
      code: `EV-${String(i + 1).padStart(3, '0')}`,
      type: pick(['Van', 'Truck', 'Car']),
      status: pick(['Charging', 'Idle', 'In Use', 'Low Battery']),
      isEv: true,
      fuelLevel: 0,
      speed: 0,
      efficiency: 0,
      totalFuelL: 0,
      soc: randInt(15, 98),
      rangeKm: randInt(150, 400),
      evDistanceKm: randInt(50, 350),
      evEnergyKwh: Math.round(rand(15, 120)),
      driverName: pick(DRIVER_NAMES),
      cityName: city.name,
      lat: city.lat + rand(-0.1, 0.1),
      lng: city.lng + rand(-0.1, 0.1),
      lastSeenAt: msDaysAgo(0.04),
    })
  }
  await inBatches(vehicles, 12, (v) =>
    prisma.vehicle.upsert({ where: { code: v.code }, update: v, create: v })
  )

  // ---------- Trips (shipments/deliveries) ----------
  // Status mix tuned so shipment_status totals resemble a busy fleet.
  const trips: any[] = []
  const TRIP_COUNT = 500
  for (let i = 0; i < TRIP_COUNT; i++) {
    const roll = rng()
    let status = 'Delivered'
    if (roll > 0.9) status = 'Failed'
    else if (roll > 0.75) status = 'Pending'
    else if (roll > 0.6) status = 'In Transit'
    const route = pick(ROUTES)
    trips.push({
      id: `trip-${String(i).padStart(4, '0')}`,
      vehicleCode: `VH-${String(randInt(1, 150)).padStart(4, '0')}`,
      driverName: pick(DRIVER_NAMES),
      routeLabel: `${route.from} \u2192 ${route.to}`,
      carrier: pick(CARRIERS),
      region: pick(REGIONS),
      status,
      costInr: randInt(1500, 5200),
      deliveryHours: status === 'Delivered' ? randInt(38, 68) : null,
      onTime: rng() > 0.12,
      occurredAt: msDaysAgo(90),
    })
  }
  await inBatches(trips, 15, (t) =>
    prisma.trip.upsert({ where: { id: t.id }, update: t, create: t })
  )

  // ---------- ADAS events ----------
  const adas: any[] = []
  let adasIdx = 0
  for (const type of ADAS_TYPES) {
    const count = randInt(20, 42)
    for (let j = 0; j < count; j++) {
      const sevRoll = rng()
      const severity = sevRoll > 0.9 ? 'High' : sevRoll > 0.65 ? 'Medium' : 'Low'
      adas.push({
        id: `adas-${String(adasIdx++).padStart(4, '0')}`,
        vehicleCode: `VH-${String(randInt(1, 150)).padStart(4, '0')}`,
        driverName: DRIVER_NAMES[randInt(0, 9)],
        type,
        severity,
        occurredAt: msDaysAgo(30),
      })
    }
  }
  await inBatches(adas, 15, (a) =>
    prisma.adasEvent.upsert({ where: { id: a.id }, update: a, create: a })
  )

  // ---------- Charging sessions ----------
  const charges: any[] = []
  for (let i = 0; i < 40; i++) {
    charges.push({
      id: `charge-${String(i).padStart(3, '0')}`,
      vehicleCode: `EV-${String(randInt(1, 30)).padStart(3, '0')}`,
      depot: pick(DEPOTS),
      durationMin: randInt(30, 240),
      energyKwh: Math.round(rand(10, 80)),
      startTime: msDaysAgo(7),
    })
  }
  await inBatches(charges, 12, (c) =>
    prisma.chargingSession.upsert({ where: { id: c.id }, update: c, create: c })
  )

  // ---------- Fleet alerts + fuel-theft alerts ----------
  const alertTypes = ['Breakdown', 'Geofence Violation', 'Speeding', 'Low Battery', 'Maintenance Due']
  const alerts: any[] = []
  for (let i = 0; i < 12; i++) {
    alerts.push({
      id: `alert-${String(i).padStart(3, '0')}`,
      code: `ALT-${randInt(1000, 9999)}`,
      vehicleCode: `VH-${String(randInt(1, 150)).padStart(4, '0')}`,
      type: pick(alertTypes),
      severity: pick(SEVERITIES),
      cityName: pick(INDIAN_CITIES).name,
      dropPct: null,
      occurredAt: msDaysAgo(1),
    })
  }
  for (let i = 0; i < 4; i++) {
    alerts.push({
      id: `theft-${String(i).padStart(3, '0')}`,
      code: `FT-${randInt(100, 999)}`,
      vehicleCode: `VH-${String(randInt(1, 150)).padStart(4, '0')}`,
      type: 'Fuel Theft',
      severity: 'High',
      cityName: pick(INDIAN_CITIES).name,
      dropPct: randInt(15, 40),
      occurredAt: msDaysAgo(2),
    })
  }
  await inBatches(alerts, 10, (a) =>
    prisma.fleetAlert.upsert({ where: { id: a.id }, update: a, create: a })
  )

  // ---------- Daily stats (90 days, most-recent-N drives every trend widget) ----------
  const daily: any[] = []
  for (let i = 0; i < 90; i++) {
    daily.push({
      id: `daily-${String(i).padStart(3, '0')}`,
      day: midnightDaysAgo(89 - i),
      utilizationPct: Math.round(rand(55, 82)),
      fuelConsumptionL: Math.round(rand(2200, 3800)),
      fuelIdleHours: Math.round(rand(40, 120)),
      fuelWasteL: Math.round(rand(80, 280)),
      avgFuelLevel: Math.round(rand(55, 75)),
      onTimeRate: Math.round(rand(82, 97)),
      avgDeliveryHours: Math.round(rand(38, 68)),
      tmsCompleted: randInt(15, 35),
      tmsPending: randInt(3, 12),
      adasHarshBraking: randInt(3, 20),
      adasLaneDeparture: randInt(1, 15),
      adasCollisionWarning: randInt(1, 15),
      adasSpeeding: randInt(1, 15),
      adasFatigue: randInt(1, 15),
      safetyScore: Math.round(rand(72, 95)),
      avgSoc: Math.round(rand(60, 72)),
    })
  }
  await inBatches(daily, 15, (d) =>
    prisma.dailyStat.upsert({ where: { id: d.id }, update: d, create: d })
  )

  console.log(
    `Fleet data seeded: ${vehicles.length} vehicles, ${drivers.length} drivers, ${routes.length} routes, ${trips.length} trips, ${adas.length} ADAS events, ${charges.length} charging sessions, ${alerts.length} alerts, ${daily.length} daily stats.`
  )
}
