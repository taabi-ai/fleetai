'use client'

import { Cloud, Droplets, Wind, Thermometer } from 'lucide-react'

function getWeatherIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 55) return '🌦️'
  if (code <= 65) return '🌧️'
  if (code <= 75) return '🌨️'
  if (code <= 82) return '🌧️'
  return '⛈️'
}

function getDesc(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 3) return 'Partly cloudy'
  if (code <= 48) return 'Foggy'
  if (code <= 55) return 'Drizzle'
  if (code <= 65) return 'Rain'
  if (code <= 75) return 'Snow'
  if (code <= 82) return 'Showers'
  return 'Thunderstorm'
}

export function WeatherWidget({ data }: { data: any }) {
  if (!data) return <div className="text-xs text-muted-foreground text-center">No data</div>

  const icon = getWeatherIcon(data?.weatherCode ?? 0)
  const desc = getDesc(data?.weatherCode ?? 0)

  return (
    <div className="h-full flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{data?.city ?? 'Unknown'}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1 my-2">
        <span className="text-4xl font-mono font-bold text-foreground">{Math.round(data?.temperature ?? 0)}</span>
        <span className="text-lg text-muted-foreground">°C</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex items-center gap-1.5">
          <Thermometer className="w-3.5 h-3.5 text-orange-400" />
          <div>
            <p className="text-[10px] text-muted-foreground">Feels like</p>
            <p className="text-xs font-medium text-foreground">{Math.round(data?.temperature ?? 0)}°</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Droplets className="w-3.5 h-3.5 text-blue-400" />
          <div>
            <p className="text-[10px] text-muted-foreground">Humidity</p>
            <p className="text-xs font-medium text-foreground">{data?.humidity ?? 0}%</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Wind className="w-3.5 h-3.5 text-teal-400" />
          <div>
            <p className="text-[10px] text-muted-foreground">Wind</p>
            <p className="text-xs font-medium text-foreground">{Math.round(data?.windSpeed ?? 0)} km/h</p>
          </div>
        </div>
      </div>
    </div>
  )
}
