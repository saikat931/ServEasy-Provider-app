import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { GlassCard } from './GlassCard';
import { ProviderBooking } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TimeFilter = 'day' | 'week' | 'month' | 'year';

interface EarningsAnalyseSectionProps {
  theme: 'dark' | 'light';
  bookings: ProviderBooking[];
  walletBalance: number;
  totalRevenue: number;
  onNavigateBack?: () => void;
  onOpenWallet?: () => void;
}

export const EarningsAnalyseSection: React.FC<EarningsAnalyseSectionProps> = ({
  theme,
  bookings,
  walletBalance,
  totalRevenue,
  onNavigateBack,
  onOpenWallet,
}) => {
  const isDark = theme === 'dark';
  const [filter, setFilter] = useState<TimeFilter>('week');
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);

  // Parse booking date string safely (formats: YYYY-MM-DD, ISO, etc.)
  const parseBookingDate = (b: ProviderBooking): Date => {
    if (b.completedAt) {
      const d = new Date(b.completedAt);
      if (!isNaN(d.getTime())) return d;
    }
    if (b.date) {
      const d = new Date(b.date);
      if (!isNaN(d.getTime())) return d;
    }
    if (b.createdAt) {
      const d = new Date(b.createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  // Filter completed / fulfilled bookings with earnings
  const completedBookings = useMemo(() => {
    return bookings.filter(
      (b) => b.status === 'completed' || (b.paymentStatus && b.paymentStatus.toUpperCase() === 'PAID')
    );
  }, [bookings]);

  // Aggregate stats & chart bars according to active filter
  const analyticsData = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (filter === 'day') {
      // 24 hours split into 6 buckets (4h each: 0-4, 4-8, 8-12, 12-16, 16-20, 20-24)
      const buckets = [
        { label: '12am', fullLabel: '12 AM - 4 AM', amount: 0, count: 0 },
        { label: '4am', fullLabel: '4 AM - 8 AM', amount: 0, count: 0 },
        { label: '8am', fullLabel: '8 AM - 12 PM', amount: 0, count: 0 },
        { label: '12pm', fullLabel: '12 PM - 4 PM', amount: 0, count: 0 },
        { label: '4pm', fullLabel: '4 PM - 8 PM', amount: 0, count: 0 },
        { label: '8pm', fullLabel: '8 PM - 12 AM', amount: 0, count: 0 },
      ];

      completedBookings.forEach((b) => {
        const d = parseBookingDate(b);
        const bStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        if (bStart === todayStart) {
          const hour = d.getHours();
          const bucketIdx = Math.min(Math.floor(hour / 4), 5);
          buckets[bucketIdx].amount += Number(b.price) || 0;
          buckets[bucketIdx].count += 1;
        }
      });

      const total = buckets.reduce((s, b) => s + b.amount, 0);
      const orders = buckets.reduce((s, b) => s + b.count, 0);

      return {
        bars: buckets,
        total,
        orders,
        periodLabel: "Today's Earnings Overview",
        subLabel: 'Hourly revenue distribution today',
      };
    }

    if (filter === 'week') {
      // Last 7 days (Mon-Sun or past 7 days)
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const buckets: Array<{ label: string; fullLabel: string; amount: number; count: number }> = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayName = days[d.getDay()];
        const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        buckets.push({
          label: dayName,
          fullLabel: `${dayName}, ${dateStr}`,
          amount: 0,
          count: 0,
        });
      }

      completedBookings.forEach((b) => {
        const d = parseBookingDate(b);
        const diffDays = Math.floor((todayStart - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / (24 * 60 * 60 * 1000));
        if (diffDays >= 0 && diffDays < 7) {
          const idx = 6 - diffDays;
          buckets[idx].amount += Number(b.price) || 0;
          buckets[idx].count += 1;
        }
      });

      const total = buckets.reduce((s, b) => s + b.amount, 0);
      const orders = buckets.reduce((s, b) => s + b.count, 0);

      return {
        bars: buckets,
        total,
        orders,
        periodLabel: 'This Week Earnings',
        subLabel: 'Last 7 days performance',
      };
    }

    if (filter === 'month') {
      // 4 weeks of current month
      const buckets = [
        { label: 'Week 1', fullLabel: 'Day 1 - 7', amount: 0, count: 0 },
        { label: 'Week 2', fullLabel: 'Day 8 - 14', amount: 0, count: 0 },
        { label: 'Week 3', fullLabel: 'Day 15 - 21', amount: 0, count: 0 },
        { label: 'Week 4+', fullLabel: 'Day 22 - End', amount: 0, count: 0 },
      ];

      completedBookings.forEach((b) => {
        const d = parseBookingDate(b);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
          const dateNum = d.getDate();
          const idx = dateNum <= 7 ? 0 : dateNum <= 14 ? 1 : dateNum <= 21 ? 2 : 3;
          buckets[idx].amount += Number(b.price) || 0;
          buckets[idx].count += 1;
        }
      });

      const total = buckets.reduce((s, b) => s + b.amount, 0);
      const orders = buckets.reduce((s, b) => s + b.count, 0);

      return {
        bars: buckets,
        total,
        orders,
        periodLabel: `${now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} Earnings`,
        subLabel: 'Weekly distribution this month',
      };
    }

    // Year (12 months)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const buckets = monthNames.map((m, idx) => ({
      label: m,
      fullLabel: `${m} ${now.getFullYear()}`,
      amount: 0,
      count: 0,
    }));

    completedBookings.forEach((b) => {
      const d = parseBookingDate(b);
      if (d.getFullYear() === now.getFullYear()) {
        const m = d.getMonth();
        buckets[m].amount += Number(b.price) || 0;
        buckets[m].count += 1;
      }
    });

    const total = buckets.reduce((s, b) => s + b.amount, 0);
    const orders = buckets.reduce((s, b) => s + b.count, 0);

    return {
      bars: buckets,
      total,
      orders,
      periodLabel: `${now.getFullYear()} Annual Earnings`,
      subLabel: 'Monthly performance this year',
    };
  }, [completedBookings, filter]);

  const maxBarValue = Math.max(...analyticsData.bars.map((b) => b.amount), 500);

  const selectedBar = selectedBarIndex !== null && analyticsData.bars[selectedBarIndex]
    ? analyticsData.bars[selectedBarIndex]
    : null;

  // Theming colors
  const primaryText = isDark ? '#FFFFFF' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';
  const chipBgInactive = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)';

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={styles.headerRow}>
        {onNavigateBack && (
          <TouchableOpacity
            onPress={onNavigateBack}
            style={[styles.backBtn, { borderColor: cardBorder }]}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color={primaryText} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: primaryText }]}>Earnings Overview</Text>
          <Text style={[styles.headerSubtitle, { color: secondaryText }]}>
            Real-time revenue performance & analytics
          </Text>
        </View>
        {onOpenWallet && (
          <TouchableOpacity
            onPress={onOpenWallet}
            style={styles.walletShortcutBtn}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="wallet-outline" size={16} color="#FFFFFF" />
            <Text style={styles.walletShortcutText}>Wallet</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Calendar Filter Pills (Day / Week / Month / Year) */}
      <View style={[styles.filterRow, { borderColor: cardBorder }]}>
        {(['day', 'week', 'month', 'year'] as TimeFilter[]).map((f) => {
          const isActive = filter === f;
          const labels: Record<TimeFilter, string> = {
            day: 'Day',
            week: 'Week',
            month: 'Month',
            year: 'Year',
          };
          return (
            <TouchableOpacity
              key={f}
              onPress={() => {
                setFilter(f);
                setSelectedBarIndex(null);
              }}
              style={[
                styles.filterChip,
                { backgroundColor: isActive ? '#0084FF' : chipBgInactive },
              ]}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons
                name={
                  f === 'day'
                    ? 'calendar-today'
                    : f === 'week'
                    ? 'calendar-range'
                    : f === 'month'
                    ? 'calendar-month'
                    : 'calendar-blank'
                }
                size={14}
                color={isActive ? '#FFFFFF' : secondaryText}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.filterChipText,
                  { color: isActive ? '#FFFFFF' : secondaryText, fontWeight: isActive ? '800' : '600' },
                ]}
              >
                {labels[f]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Total for Selected Period Banner Card */}
      <GlassCard
        theme={theme}
        intensity={35}
        style={[styles.kpiCard, { borderColor: cardBorder }]}
      >
        <View style={styles.kpiTopRow}>
          <View>
            <Text style={[styles.kpiPeriod, { color: secondaryText }]}>
              {analyticsData.periodLabel}
            </Text>
            <Text style={styles.kpiAmount}>
              ₹{analyticsData.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          <View style={styles.kpiBadge}>
            <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={20} color="#30D158" />
            <Text style={styles.kpiOrdersText}>{analyticsData.orders} Jobs</Text>
          </View>
        </View>

        <View style={[styles.kpiDivider, { backgroundColor: cardBorder }]} />

        <View style={styles.kpiMetaRow}>
          <View style={styles.kpiMetaItem}>
            <Text style={[styles.kpiMetaLabel, { color: secondaryText }]}>Wallet Balance</Text>
            <Text style={[styles.kpiMetaVal, { color: '#0084FF' }]}>
              ₹{walletBalance.toFixed(2)}
            </Text>
          </View>
          <View style={styles.kpiMetaItem}>
            <Text style={[styles.kpiMetaLabel, { color: secondaryText }]}>Avg. Per Job</Text>
            <Text style={[styles.kpiMetaVal, { color: primaryText }]}>
              ₹
              {analyticsData.orders > 0
                ? (analyticsData.total / analyticsData.orders).toFixed(0)
                : '0'}
            </Text>
          </View>
          <View style={styles.kpiMetaItem}>
            <Text style={[styles.kpiMetaLabel, { color: secondaryText }]}>All-Time Sales</Text>
            <Text style={[styles.kpiMetaVal, { color: '#30D158' }]}>
              ₹{totalRevenue.toFixed(0)}
            </Text>
          </View>
        </View>
      </GlassCard>

      {/* Interactive Bar Graph Section */}
      <GlassCard
        theme={theme}
        intensity={30}
        style={[styles.chartCard, { borderColor: cardBorder }]}
      >
        <View style={styles.chartHeader}>
          <View>
            <Text style={[styles.chartTitle, { color: primaryText }]}>Revenue Trend Graph</Text>
            <Text style={[styles.chartSubtitle, { color: secondaryText }]}>
              {selectedBar
                ? `${selectedBar.fullLabel}: ₹${selectedBar.amount.toFixed(2)} (${selectedBar.count} jobs)`
                : analyticsData.subLabel}
            </Text>
          </View>
          {selectedBar && (
            <TouchableOpacity
              onPress={() => setSelectedBarIndex(null)}
              style={styles.clearBarBtn}
            >
              <Text style={styles.clearBarText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Bar Chart Container */}
        <ScrollView
          horizontal={filter === 'year'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.barsContainer, filter === 'year' && { paddingHorizontal: 8 }]}
        >
          {analyticsData.bars.map((bar, idx) => {
            const isSelected = selectedBarIndex === idx;
            const barHeightPercent = Math.max(
              Math.min((bar.amount / maxBarValue) * 100, 100),
              bar.amount > 0 ? 10 : 3
            );

            return (
              <TouchableOpacity
                key={`${bar.label}-${idx}`}
                onPress={() => setSelectedBarIndex(isSelected ? null : idx)}
                style={[
                  styles.barCol,
                  filter === 'year' ? { width: 44, marginHorizontal: 3 } : { flex: 1 },
                ]}
                activeOpacity={0.8}
              >
                {/* Popover on active bar */}
                {isSelected && (
                  <View style={styles.barTooltip}>
                    <Text style={styles.barTooltipText}>₹{bar.amount.toFixed(0)}</Text>
                  </View>
                )}

                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${barHeightPercent}%`,
                        backgroundColor: isSelected
                          ? '#0084FF'
                          : bar.amount > 0
                          ? '#30D158'
                          : isDark
                          ? 'rgba(255,255,255,0.1)'
                          : 'rgba(15,23,42,0.1)',
                      },
                    ]}
                  />
                </View>

                <Text
                  style={[
                    styles.barLabel,
                    {
                      color: isSelected ? '#0084FF' : secondaryText,
                      fontWeight: isSelected ? '800' : '600',
                    },
                  ]}
                  numberOfLines={1}
                >
                  {bar.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </GlassCard>

      {/* Breakdown List of Recent Completed Jobs */}
      <Text style={[styles.sectionHeading, { color: primaryText }]}>
        Recent Completed Services ({completedBookings.length})
      </Text>

      {completedBookings.length === 0 ? (
        <GlassCard theme={theme} style={[styles.emptyCard, { borderColor: cardBorder }]}>
          <MaterialCommunityIcons name="cash-remove" size={36} color={secondaryText} />
          <Text style={[styles.emptyText, { color: primaryText }]}>No Completed Earnings Yet</Text>
          <Text style={[styles.emptySub, { color: secondaryText }]}>
            Fulfill accepted customer bookings to see live daily earnings here.
          </Text>
        </GlassCard>
      ) : (
        completedBookings.slice(0, 10).map((b) => (
          <GlassCard
            key={b.id || b.numericId}
            theme={theme}
            style={[styles.bookingRow, { borderColor: cardBorder }]}
          >
            <View style={styles.bookingIconWrap}>
              <MaterialCommunityIcons name="check-circle" size={20} color="#30D158" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.bookingTitle, { color: primaryText }]} numberOfLines={1}>
                {b.serviceName}
              </Text>
              <Text style={[styles.bookingMeta, { color: secondaryText }]}>
                #{b.bookingNumber} • {b.date || 'Today'} • {b.customerName || 'Customer'}
              </Text>
            </View>
            <Text style={styles.bookingPrice}>+₹{Number(b.price || 0).toFixed(2)}</Text>
          </GlassCard>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  walletShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0084FF',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  walletShortcutText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 6,
    marginBottom: 16,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  filterChipText: {
    fontSize: 12,
  },
  kpiCard: {
    padding: 16,
    borderRadius: 18,
    marginBottom: 16,
  },
  kpiTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  kpiPeriod: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  kpiAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#30D158',
    marginTop: 4,
  },
  kpiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  kpiOrdersText: {
    color: '#30D158',
    fontSize: 12,
    fontWeight: '800',
  },
  kpiDivider: {
    height: 1,
    marginVertical: 14,
  },
  kpiMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kpiMetaItem: {
    flex: 1,
  },
  kpiMetaLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  kpiMetaVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  chartCard: {
    padding: 16,
    borderRadius: 18,
    marginBottom: 20,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  chartSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  clearBarBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  clearBarText: {
    color: '#0084FF',
    fontSize: 11,
    fontWeight: '700',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 150,
    paddingTop: 24,
  },
  barCol: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  barTooltip: {
    position: 'absolute',
    top: -24,
    backgroundColor: '#0084FF',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    zIndex: 10,
  },
  barTooltipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  barTrack: {
    width: 14,
    height: 110,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 7,
  },
  barLabel: {
    fontSize: 10,
    marginTop: 8,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
  },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  bookingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
  },
  bookingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  bookingMeta: {
    fontSize: 11,
    marginTop: 2,
  },
  bookingPrice: {
    color: '#30D158',
    fontSize: 13,
    fontWeight: '800',
  },
});
