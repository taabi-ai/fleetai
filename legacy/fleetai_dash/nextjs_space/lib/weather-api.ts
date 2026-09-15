// Open-Meteo free weather API integration

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  mumbai: { lat: 19.076, lng: 72.877 },
  delhi: { lat: 28.644, lng: 77.216 },
  bangalore: { lat: 12.971, lng: 77.594 },
  chennai: { lat: 13.082, lng: 80.270 },
  hyderabad: { lat: 17.385, lng: 78.486 },
  pune: { lat: 18.520, lng: 73.856 },
  london: { lat: 51.507, lng: -0.127 },
  'new york': { lat: 40.712, lng: -74.005 },
  kolkata: { lat: 22.572, lng: 88.363 },
  ahmedabad: { lat: 23.022, lng: 72.571 },
};

export function getCityCoords(city: string): { lat: number; lng: number } | null {
  const key = city.toLowerCase().trim();
  return CITY_COORDS[key] ?? null;
}

export async function fetchCurrentWeather(city: string) {
  const coords = getCityCoords(city);
  if (!coords) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,windspeed_10m&forecast_days=1&timezone=auto`;
  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    city: city.charAt(0).toUpperCase() + city.slice(1),
    temperature: data?.current_weather?.temperature ?? 0,
    windSpeed: data?.current_weather?.windspeed ?? 0,
    weatherCode: data?.current_weather?.weathercode ?? 0,
    humidity: data?.hourly?.relativehumidity_2m?.[new Date().getHours()] ?? 0,
    hourlyTemp: (data?.hourly?.temperature_2m ?? []).slice(0, 24),
    hourlyHumidity: (data?.hourly?.relativehumidity_2m ?? []).slice(0, 24),
    hourlyWind: (data?.hourly?.windspeed_10m ?? []).slice(0, 24),
    time: data?.hourly?.time?.slice(0, 24) ?? [],
  };
}

export async function fetchWeatherForecast(city: string, days: number = 7) {
  const coords = getCityCoords(city);
  if (!coords) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&forecast_days=${days}&timezone=auto`;
  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) return null;
  const data = await res.json();
  const dailyTime = data?.daily?.time ?? [];
  return {
    city: city.charAt(0).toUpperCase() + city.slice(1),
    days: dailyTime.map((t: string, i: number) => ({
      date: t,
      maxTemp: data?.daily?.temperature_2m_max?.[i] ?? 0,
      minTemp: data?.daily?.temperature_2m_min?.[i] ?? 0,
      precipitation: data?.daily?.precipitation_sum?.[i] ?? 0,
      windSpeed: data?.daily?.windspeed_10m_max?.[i] ?? 0,
    })),
  };
}

export function getWeatherDescription(code: number): string {
  const descriptions: Record<number, string> = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
    55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 80: 'Slight showers',
    81: 'Moderate showers', 82: 'Violent showers', 95: 'Thunderstorm',
  };
  return descriptions[code] ?? 'Unknown';
}

export function getWeatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 3) return '⛅';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 65) return '🌧️';
  if (code <= 75) return '🌨️';
  if (code <= 82) return '🌧️';
  return '⛈️';
}
