import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { GlassCard } from './GlassCard';
import { fetchCurrentWeather, getTimeOfDayGreeting, WeatherSnapshot } from '../services/weatherHelper';

interface GreetingWeatherCardProps {
  theme: 'dark' | 'light';
  providerName?: string;
  latitude?: number;
  longitude?: number;
  addressHint?: string;
  refreshTrigger?: number;
}

function formatClock(now: Date): { timeText: string; secondsText: string; periodText: string; dateText: string } {
  const rawHours = now.getHours();
  const periodText = rawHours >= 12 ? 'PM' : 'AM';
  const hours12 = rawHours % 12 === 0 ? 12 : rawHours % 12;
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const secondsText = String(now.getSeconds()).padStart(2, '0');

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateText = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]}`;

  return {
    timeText: `${hours12}:${minutes}`,
    secondsText,
    periodText,
    dateText,
  };
}

function extractShortName(fullName?: string): string {
  if (!fullName) return '';
  const cleaned = fullName.replace(/^(mr\.|mrs\.|ms\.|dr\.)\s+/i, '').trim();
  const parts = cleaned.split(/\s+/).filter((p) => p.length > 0 && /^[A-Za-z0-9]/.test(p));

  if (parts.length >= 2) {
    // Short name like first letters of full name (e.g. "Rajsekhar Jana" -> "RJ")
    return parts.map((p) => p[0].toUpperCase()).join('');
  }

  if (parts.length === 1) {
    const single = parts[0];
    if (single.length > 4) {
      return single.substring(0, 3);
    }
    return single;
  }

  return '';
}

/**
 * Isolated greeting, live digital clock, and current local weather hero card for Overview.
 * Keeps its 1s clock tick internal so the parent dashboard screen does not re-render every second.
 */
export const GreetingWeatherCard: React.FC<GreetingWeatherCardProps> = ({
  theme,
  providerName,
  latitude,
  longitude,
  addressHint,
  refreshTrigger = 0,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState<boolean>(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadWeather = useCallback(async () => {
    setIsWeatherLoading(true);
    const snapshot = await fetchCurrentWeather(latitude, longitude, addressHint);
    if (snapshot) {
      setWeather(snapshot);
    }
    setIsWeatherLoading(false);
  }, [latitude, longitude, addressHint]);

  useEffect(() => {
    loadWeather();
    const weatherInterval = setInterval(loadWeather, 15 * 60 * 1000);
    return () => clearInterval(weatherInterval);
  }, [loadWeather, refreshTrigger]);

  const greetingMeta = getTimeOfDayGreeting(now);
  const clock = formatClock(now);
  const shortName = extractShortName(providerName);
  const fullGreeting = shortName ? `${greetingMeta.greeting}, ${shortName}!` : `${greetingMeta.greeting}!`;

  const isDark = theme === 'dark';
  const textPrimary = isDark ? '#FFFFFF' : '#0F172A';
  const textSecondary = isDark ? '#A5B0BE' : '#475569';
  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(15, 23, 42, 0.08)';
  const pillBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.65)';
  const pillBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 132, 255, 0.16)';

  return (
    <GlassCard theme={theme} style={styles.cardShell} intensity={isDark ? 30 : 35}>
      <LinearGradient
        colors={isDark ? greetingMeta.darkGradient : greetingMeta.lightGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientInner}
      >
        {/* Top Row: Dynamic Greeting + Live Clock */}
        <View style={styles.topRow}>
          <View style={styles.greetingLeft}>
            <View
              style={[
                styles.greetingIconOrb,
                { backgroundColor: `${greetingMeta.accentColor}24`, borderColor: `${greetingMeta.accentColor}55` },
              ]}
            >
              <MaterialCommunityIcons
                name={greetingMeta.iconName as any}
                size={22}
                color={greetingMeta.accentColor}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.greetingTitle, { color: textPrimary }]} numberOfLines={1}>
                {fullGreeting}
              </Text>
              <Text style={[styles.dateSubtitle, { color: textSecondary }]} numberOfLines={1}>
                {clock.dateText} • {greetingMeta.tagline}
              </Text>
            </View>
          </View>

          <View style={[styles.clockPill, { backgroundColor: pillBg, borderColor: pillBorder }]}>
            <Text style={[styles.clockTimeText, { color: textPrimary }]}>{clock.timeText}</Text>
            <View style={styles.clockSuffixCol}>
              <Text style={[styles.clockPeriodText, { color: greetingMeta.accentColor }]}>{clock.periodText}</Text>
              <Text style={[styles.clockSecondsText, { color: textSecondary }]}>{clock.secondsText}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: dividerColor }]} />

        {/* Bottom Row: Live Local Weather */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={loadWeather}
          style={styles.weatherRow}
        >
          {weather ? (
            <>
              <View style={styles.weatherLeft}>
                <View style={[styles.weatherIconWrap, { backgroundColor: `${weather.accentColor}1E` }]}>
                  <MaterialCommunityIcons
                    name={weather.iconName as any}
                    size={26}
                    color={weather.accentColor}
                  />
                </View>
                <View style={styles.tempGroup}>
                  <View style={styles.tempLine}>
                    <Text style={[styles.tempValue, { color: textPrimary }]}>{weather.temperatureC}°C</Text>
                    <Text style={[styles.conditionText, { color: textPrimary }]} numberOfLines={1}>
                      {weather.conditionLabel}
                    </Text>
                  </View>
                  <View style={styles.locationLine}>
                    <MaterialCommunityIcons name="map-marker-outline" size={12} color={textSecondary} />
                    <Text style={[styles.cityText, { color: textSecondary }]} numberOfLines={1}>
                      {weather.cityLabel} • Feels {weather.apparentTempC}°C
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.weatherMetricsRight}>
                <View style={[styles.metricChip, { backgroundColor: pillBg, borderColor: pillBorder }]}>
                  <MaterialCommunityIcons name="water-percent" size={14} color="#38BDF8" />
                  <Text style={[styles.metricChipText, { color: textPrimary }]}>{weather.humidity}%</Text>
                </View>
                <View style={[styles.metricChip, { backgroundColor: pillBg, borderColor: pillBorder }]}>
                  <MaterialCommunityIcons name="weather-windy" size={13} color="#30D158" />
                  <Text style={[styles.metricChipText, { color: textPrimary }]}>{weather.windKmh} km/h</Text>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.weatherLoadingRow}>
              <View style={styles.weatherLeft}>
                {isWeatherLoading ? (
                  <ActivityIndicator size="small" color={greetingMeta.accentColor} style={{ marginRight: 10 }} />
                ) : (
                  <MaterialCommunityIcons
                    name="weather-partly-cloudy"
                    size={20}
                    color={textSecondary}
                    style={{ marginRight: 8 }}
                  />
                )}
                <Text style={[styles.weatherFallbackText, { color: textSecondary }]}>
                  {isWeatherLoading ? 'Fetching local weather...' : 'Weather unavailable — tap to retry'}
                </Text>
              </View>
              <MaterialCommunityIcons name="refresh" size={16} color={textSecondary} />
            </View>
          )}
        </TouchableOpacity>
      </LinearGradient>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  cardShell: {
    width: '100%',
    marginBottom: 14,
  },
  gradientInner: {
    padding: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  greetingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  greetingIconOrb: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  greetingTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  dateSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  clockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  clockTimeText: {
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  clockSuffixCol: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  clockPeriodText: {
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 10,
  },
  clockSecondsText: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 10,
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 11,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  weatherLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  weatherIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  tempGroup: {
    flex: 1,
    minWidth: 0,
  },
  tempLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  tempValue: {
    fontSize: 19,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  conditionText: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  locationLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  cityText: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  weatherMetricsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    gap: 3,
  },
  metricChipText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  weatherLoadingRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  weatherFallbackText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
