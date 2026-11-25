/**
 * ServEasy Provider - Live Weather & Greeting Helper
 * Uses Open-Meteo (100% Free, Zero API Keys) + Expo Location / BigDataCloud city fallback.
 */

import * as Location from 'expo-location';

export interface WeatherSnapshot {
  temperatureC: number;
  apparentTempC: number;
  humidity: number;
  windKmh: number;
  weatherCode: number;
  isDay: boolean;
  conditionLabel: string;
  iconName: string;
  accentColor: string;
  cityLabel: string;
  fetchedAt: number;
}

export interface GreetingMeta {
  greeting: string;
  tagline: string;
  iconName: string;
  accentColor: string;
  darkGradient: readonly [string, string];
  lightGradient: readonly [string, string];
}

interface WeatherDescriptor {
  label: string;
  dayIcon: string;
  nightIcon: string;
  accentColor: string;
}

const WEATHER_CODE_TABLE: ReadonlyArray<{ codes: number[]; info: WeatherDescriptor }> = [
  {
    codes: [0],
    info: { label: 'Clear Sky', dayIcon: 'weather-sunny', nightIcon: 'weather-night', accentColor: '#FFB300' },
  },
  {
    codes: [1, 2],
    info: { label: 'Partly Cloudy', dayIcon: 'weather-partly-cloudy', nightIcon: 'weather-night-partly-cloudy', accentColor: '#F59E0B' },
  },
  {
    codes: [3],
    info: { label: 'Cloudy', dayIcon: 'weather-cloudy', nightIcon: 'weather-cloudy', accentColor: '#94A3B8' },
  },
  {
    codes: [45, 48],
    info: { label: 'Misty Fog', dayIcon: 'weather-fog', nightIcon: 'weather-fog', accentColor: '#94A3B8' },
  },
  {
    codes: [51, 53, 55, 56, 57],
    info: { label: 'Light Drizzle', dayIcon: 'weather-rainy', nightIcon: 'weather-rainy', accentColor: '#38BDF8' },
  },
  {
    codes: [61, 63, 65, 66, 67, 80, 81, 82],
    info: { label: 'Rain Showers', dayIcon: 'weather-pouring', nightIcon: 'weather-pouring', accentColor: '#0EA5E9' },
  },
  {
    codes: [71, 73, 75, 77, 85, 86],
    info: { label: 'Snowfall', dayIcon: 'weather-snowy', nightIcon: 'weather-snowy', accentColor: '#BAE6FD' },
  },
  {
    codes: [95, 96, 99],
    info: { label: 'Thunderstorm', dayIcon: 'weather-lightning-rainy', nightIcon: 'weather-lightning-rainy', accentColor: '#A855F7' },
  },
];

const GREETING_SLOTS: ReadonlyArray<{ startHour: number; endHour: number; meta: GreetingMeta }> = [
  {
    startHour: 5,
    endHour: 11,
    meta: {
      greeting: 'Good Morning',
      tagline: 'Fresh day ahead — ready for service',
      iconName: 'weather-sunset-up',
      accentColor: '#FFB300',
      darkGradient: ['rgba(255, 179, 0, 0.16)', 'rgba(0, 132, 255, 0.08)'],
      lightGradient: ['rgba(255, 214, 10, 0.24)', 'rgba(0, 132, 255, 0.10)'],
    },
  },
  {
    startHour: 12,
    endHour: 16,
    meta: {
      greeting: 'Good Afternoon',
      tagline: 'Stay online to catch live bookings',
      iconName: 'white-balance-sunny',
      accentColor: '#38BDF8',
      darkGradient: ['rgba(0, 132, 255, 0.20)', 'rgba(48, 209, 88, 0.08)'],
      lightGradient: ['rgba(56, 189, 248, 0.22)', 'rgba(0, 132, 255, 0.08)'],
    },
  },
  {
    startHour: 17,
    endHour: 20,
    meta: {
      greeting: 'Good Evening',
      tagline: 'Peak evening hours — stay ready',
      iconName: 'weather-sunset-down',
      accentColor: '#FF9500',
      darkGradient: ['rgba(255, 149, 0, 0.18)', 'rgba(175, 82, 222, 0.12)'],
      lightGradient: ['rgba(255, 149, 0, 0.20)', 'rgba(175, 82, 222, 0.10)'],
    },
  },
];

const NIGHT_GREETING_META: GreetingMeta = {
  greeting: 'Good Night',
  tagline: 'Active for late-hour service calls',
  iconName: 'weather-night',
  accentColor: '#818CF8',
  darkGradient: ['rgba(99, 102, 241, 0.20)', 'rgba(15, 23, 42, 0.15)'],
  lightGradient: ['rgba(99, 102, 241, 0.18)', 'rgba(0, 132, 255, 0.08)'],
};

/**
 * Return greeting text, tagline, icon, and gradient tint for the current hour.
 */
export function getTimeOfDayGreeting(now: Date): GreetingMeta {
  const hour = now.getHours();
  const matched = GREETING_SLOTS.find((slot) => hour >= slot.startHour && hour <= slot.endHour);
  return matched ? matched.meta : NIGHT_GREETING_META;
}

function describeWeatherCode(code: number, isDay: boolean): { label: string; iconName: string; accentColor: string } {
  const entry = WEATHER_CODE_TABLE.find((item) => item.codes.includes(code));
  if (!entry) {
    return {
      label: isDay ? 'Fair Weather' : 'Clear Night',
      iconName: isDay ? 'weather-partly-cloudy' : 'weather-night-partly-cloudy',
      accentColor: isDay ? '#38BDF8' : '#818CF8',
    };
  }
  return {
    label: entry.info.label,
    iconName: isDay ? entry.info.dayIcon : entry.info.nightIcon,
    accentColor: entry.info.accentColor,
  };
}

function extractCityFromHint(addressHint?: string): string {
  if (!addressHint || !addressHint.trim()) return '';
  const parts = addressHint
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^\d{5,6}$/.test(p));
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] || '';
}

async function resolveCoordinatesNonIntrusive(
  preferredLat?: number,
  preferredLng?: number,
  addressHint?: string
): Promise<{ lat: number; lng: number; city: string }> {
  // 1. Check already-granted GPS permission without showing a popup prompt on load
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm?.granted) {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown?.coords) {
        return {
          lat: Number(lastKnown.coords.latitude.toFixed(4)),
          lng: Number(lastKnown.coords.longitude.toFixed(4)),
          city: extractCityFromHint(addressHint),
        };
      }
    }
  } catch (_) {}

  // 2. Use provider's saved map coordinates if valid
  if (preferredLat && preferredLng && Math.abs(preferredLat) > 0.01 && Math.abs(preferredLng) > 0.01) {
    return {
      lat: Number(preferredLat.toFixed(4)),
      lng: Number(preferredLng.toFixed(4)),
      city: extractCityFromHint(addressHint),
    };
  }

  // 3. Lightweight IP geolocation fallback
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en', {
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (res.ok) {
      const d = await res.json();
      if (d?.latitude && d?.longitude) {
        return {
          lat: Number(Number(d.latitude).toFixed(4)),
          lng: Number(Number(d.longitude).toFixed(4)),
          city: d.city || d.locality || extractCityFromHint(addressHint) || 'Local Area',
        };
      }
    }
  } catch (_) {}

  return { lat: 22.5726, lng: 88.3639, city: extractCityFromHint(addressHint) || 'Kolkata' };
}

/**
 * Fetch current weather metrics and city label via Open-Meteo.
 */
export async function fetchCurrentWeather(
  preferredLat?: number,
  preferredLng?: number,
  addressHint?: string
): Promise<WeatherSnapshot | null> {
  try {
    const loc = await resolveCoordinatesNonIntrusive(preferredLat, preferredLng, addressHint);
    let cityLabel = loc.city;

    // Fetch live Open-Meteo weather + city name (if not yet resolved) in parallel
    const weatherPromise = (async () => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m&timezone=auto`;
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      if (!res.ok) return null;
      return await res.json();
    })();

    const cityPromise = cityLabel
      ? Promise.resolve(cityLabel)
      : (async () => {
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 3500);
            const res = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${loc.lat}&longitude=${loc.lng}&localityLanguage=en`,
              { signal: ctrl.signal }
            );
            clearTimeout(tid);
            if (!res.ok) return '';
            const d = await res.json();
            return d?.city || d?.locality || d?.principalSubdivision || '';
          } catch {
            return '';
          }
        })();

    const [weatherJson, resolvedCity] = await Promise.all([weatherPromise, cityPromise]);
    const current = weatherJson?.current;
    if (!current) return null;

    if (resolvedCity) cityLabel = resolvedCity;

    const weatherCode = Number(current.weather_code ?? 0);
    const isDay = Number(current.is_day ?? 1) === 1;
    const desc = describeWeatherCode(weatherCode, isDay);

    return {
      temperatureC: Math.round(Number(current.temperature_2m ?? 0)),
      apparentTempC: Math.round(Number(current.apparent_temperature ?? current.temperature_2m ?? 0)),
      humidity: Math.round(Number(current.relative_humidity_2m ?? 0)),
      windKmh: Math.round(Number(current.wind_speed_10m ?? 0)),
      weatherCode,
      isDay,
      conditionLabel: desc.label,
      iconName: desc.iconName,
      accentColor: desc.accentColor,
      cityLabel: cityLabel || 'Local Weather',
      fetchedAt: Date.now(),
    };
  } catch (err) {
    console.warn('[weatherHelper] Failed to fetch weather:', err);
    return null;
  }
}
