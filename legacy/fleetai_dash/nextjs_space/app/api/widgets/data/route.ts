export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { resolveMetricData } from '@/lib/mock-data'
import { fetchCurrentWeather, fetchWeatherForecast } from '@/lib/weather-api'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { dataSource, metric, params } = body ?? {}

    if (!dataSource || !metric) {
      return NextResponse.json({ error: 'dataSource and metric required' }, { status: 400 })
    }

    // Weather uses real API
    if (dataSource === 'weather') {
      const city = params?.city ?? 'Mumbai'
      if (metric === 'current') {
        const data = await fetchCurrentWeather(city)
        if (!data) return NextResponse.json({ error: `Could not fetch weather for ${city}` }, { status: 404 })
        return NextResponse.json(data)
      }
      if (metric === 'forecast') {
        const data = await fetchWeatherForecast(city, params?.days ?? 7)
        if (!data) return NextResponse.json({ error: `Could not fetch forecast for ${city}` }, { status: 404 })
        return NextResponse.json(data)
      }
      return NextResponse.json({ error: 'Unknown weather metric' }, { status: 400 })
    }

    // All other data is aggregated live from the database.
    const data = await resolveMetricData(dataSource, metric, params)
    if (data === null) {
      return NextResponse.json({ error: `No data found for ${dataSource}/${metric}` }, { status: 404 })
    }
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed to fetch data' }, { status: 500 })
  }
}
