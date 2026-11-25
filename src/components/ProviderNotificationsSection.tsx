import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassCard } from './GlassCard';
import { ProviderBooking } from '../services/api';

export interface StoredAlertItem {
  id: string;
  title: string;
  message: string;
  type: 'booking' | 'system' | 'payout' | 'profile';
  timestamp: string; // ISO string
  bookingId?: number;
  bookingNumber?: string;
  read: boolean;
}

interface ProviderNotificationsSectionProps {
  theme: 'dark' | 'light';
  providerId?: number | null;
  bookings: ProviderBooking[];
  onNavigateToBooking?: (bookingNumber: string) => void;
  onOpenRingtoneSettings?: () => void;
  onNavigateBack?: () => void;
}

const STORAGE_KEY_PREFIX = 'serveasy_provider_alerts_';

export const ProviderNotificationsSection: React.FC<ProviderNotificationsSectionProps> = ({
  theme,
  providerId,
  bookings,
  onNavigateToBooking,
  onOpenRingtoneSettings,
  onNavigateBack,
}) => {
  const isDark = theme === 'dark';
  const [filter, setFilter] = useState<'all' | 'unread' | 'booking' | 'system'>('all');
  const [storedAlerts, setStoredAlerts] = useState<StoredAlertItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const storageKey = providerId ? `${STORAGE_KEY_PREFIX}${providerId}` : `${STORAGE_KEY_PREFIX}guest`;

  // Generate notifications from recent bookings + system events
  const loadAlerts = useCallback(async () => {
    try {
      const savedRaw = await AsyncStorage.getItem(storageKey);
      let localAlerts: StoredAlertItem[] = savedRaw ? JSON.parse(savedRaw) : [];

      // Synthesize booking alerts from live bookings if not already present
      const existingIds = new Set(localAlerts.map((a) => a.id));

      const bookingAlerts: StoredAlertItem[] = [];
      bookings.slice(0, 30).forEach((b) => {
        const id = `booking_${b.id || b.numericId}_${b.status}`;
        if (!existingIds.has(id)) {
          let title = 'Booking Alert';
          let msg = `Booking #${b.bookingNumber} for ${b.serviceName}`;
          if (b.status === 'pending') {
            title = '🔔 New Booking Request';
            msg = `New request #${b.bookingNumber} from ${b.customerName || 'Customer'} (₹${b.price})`;
          } else if (b.status === 'accepted') {
            title = '✅ Booking Confirmed';
            msg = `Accepted #${b.bookingNumber} for ${b.serviceName} at ${b.time || 'scheduled time'}`;
          } else if (b.status === 'completed') {
            title = '🎉 Booking Completed';
            msg = `Completed #${b.bookingNumber}! ₹${b.price} added to your account`;
          } else if (b.status === 'cancelled' || b.status === 'rejected') {
            title = '⚠️ Booking Closed';
            msg = `Booking #${b.bookingNumber} was closed or cancelled`;
          }

          bookingAlerts.push({
            id,
            title,
            message: msg,
            type: 'booking',
            timestamp: b.completedAt || b.createdAt || b.date || new Date().toISOString(),
            bookingId: b.numericId,
            bookingNumber: b.bookingNumber,
            read: false,
          });
        }
      });

      // System welcome/ready alert
      if (!existingIds.has('sys_welcome')) {
        bookingAlerts.push({
          id: 'sys_welcome',
          title: '🛡️ Provider System Online',
          message: 'Welcome to ServEasy Partner Portal. Live bookings and emergency dispatch are active.',
          type: 'system',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          read: true,
        });
      }

      const merged = [...bookingAlerts, ...localAlerts];
      // Sort newest first
      merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setStoredAlerts(merged);
      await AsyncStorage.setItem(storageKey, JSON.stringify(merged.slice(0, 100)));
    } catch (e) {
      console.warn('Error loading stored alerts:', e);
    }
  }, [bookings, storageKey]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAlerts();
    setRefreshing(false);
  };

  const markAllRead = async () => {
    const updated = storedAlerts.map((a) => ({ ...a, read: true }));
    setStoredAlerts(updated);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const markSingleRead = async (id: string) => {
    const updated = storedAlerts.map((a) => (a.id === id ? { ...a, read: true } : a));
    setStoredAlerts(updated);
    await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const clearAllAlerts = async () => {
    setStoredAlerts([]);
    await AsyncStorage.removeItem(storageKey);
  };

  // Filtered list
  const filteredAlerts = useMemo(() => {
    return storedAlerts.filter((a) => {
      if (filter === 'unread') return !a.read;
      if (filter === 'booking') return a.type === 'booking';
      if (filter === 'system') return a.type === 'system';
      return true;
    });
  }, [storedAlerts, filter]);

  const unreadCount = useMemo(() => {
    return storedAlerts.filter((a) => !a.read).length;
  }, [storedAlerts]);

  // Theming
  const primaryText = isDark ? '#FFFFFF' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)';

  const formatRelative = (iso: string) => {
    try {
      const diffMs = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      const days = Math.floor(hrs / 24);
      if (days === 1) return 'Yesterday';
      return `${days}d ago`;
    } catch {
      return 'Recently';
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.headerTitle, { color: primaryText }]}>Alerts & Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount} New</Text>
              </View>
            )}
          </View>
          <Text style={[styles.headerSubtitle, { color: secondaryText }]}>
            Stored live booking rings, dispatches & system alerts
          </Text>
        </View>

        {onOpenRingtoneSettings && (
          <TouchableOpacity
            onPress={onOpenRingtoneSettings}
            style={[styles.soundSettingsBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }]}
            activeOpacity={0.75}
            accessibilityLabel="Ringtone Settings"
          >
            <MaterialCommunityIcons name="tune" size={18} color="#0084FF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Chips + Mark All Read */}
      <View style={styles.controlsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsRow}>
          {[
            { key: 'all', label: `All (${storedAlerts.length})` },
            { key: 'unread', label: `Unread (${unreadCount})` },
            { key: 'booking', label: 'Bookings' },
            { key: 'system', label: 'System' },
          ].map((item) => {
            const isActive = filter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => setFilter(item.key as any)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isActive ? '#0084FF' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.05)',
                  },
                ]}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color: isActive ? '#FFFFFF' : secondaryText,
                      fontWeight: isActive ? '800' : '600',
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead} style={styles.markReadBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="check-all" size={14} color="#0084FF" />
            <Text style={styles.markReadText}>Mark Read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notifications List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0084FF" colors={['#0084FF']} />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {filteredAlerts.length === 0 ? (
          <GlassCard theme={theme} style={[styles.emptyCard, { borderColor: cardBorder }]}>
            <MaterialCommunityIcons name="bell-check-outline" size={44} color={secondaryText} />
            <Text style={[styles.emptyTitle, { color: primaryText }]}>All Caught Up!</Text>
            <Text style={[styles.emptySub, { color: secondaryText }]}>
              {filter === 'unread'
                ? 'You have zero unread alerts.'
                : 'No stored alerts in this category.'}
            </Text>
          </GlassCard>
        ) : (
          filteredAlerts.map((item) => {
            const isBooking = item.type === 'booking';
            const isUnread = !item.read;

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  markSingleRead(item.id);
                  if (item.bookingNumber && onNavigateToBooking) {
                    onNavigateToBooking(item.bookingNumber);
                  }
                }}
                activeOpacity={0.8}
              >
                <GlassCard
                  theme={theme}
                  intensity={30}
                  style={[
                    styles.alertCard,
                    {
                      borderColor: isUnread ? 'rgba(0, 132, 255, 0.45)' : cardBorder,
                      backgroundColor: isUnread
                        ? (isDark ? 'rgba(0, 132, 255, 0.08)' : 'rgba(0, 132, 255, 0.05)')
                        : undefined,
                    },
                  ]}
                >
                  <View style={styles.alertCardContent}>
                    <View
                      style={[
                        styles.alertIconWrap,
                        {
                          backgroundColor: isBooking
                            ? 'rgba(48, 209, 88, 0.14)'
                            : 'rgba(0, 132, 255, 0.14)',
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          isBooking
                            ? (item.title.includes('New') ? 'bell-ring' : 'calendar-check')
                            : 'shield-check'
                        }
                        size={20}
                        color={isBooking ? '#30D158' : '#0084FF'}
                      />
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={styles.alertHeaderRow}>
                        <Text style={[styles.alertTitle, { color: primaryText }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[styles.alertTime, { color: secondaryText }]}>
                          {formatRelative(item.timestamp)}
                        </Text>
                      </View>

                      <Text style={[styles.alertMessage, { color: secondaryText }]} numberOfLines={2}>
                        {item.message}
                      </Text>

                      {item.bookingNumber && (
                        <View style={styles.bookingActionPill}>
                          <Text style={styles.bookingActionText}>View Booking #{item.bookingNumber} →</Text>
                        </View>
                      )}
                    </View>

                    {isUnread && <View style={styles.unreadDot} />}
                  </View>
                </GlassCard>
              </TouchableOpacity>
            );
          })
        )}

        {storedAlerts.length > 0 && (
          <TouchableOpacity onPress={clearAllAlerts} style={styles.clearAllBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="trash-can-outline" size={14} color="#FF453A" />
            <Text style={styles.clearAllText}>Clear All Alerts</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
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
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  unreadBadge: {
    backgroundColor: '#FF453A',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  soundSettingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 12,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  filterChipText: {
    fontSize: 12,
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  markReadText: {
    color: '#0084FF',
    fontSize: 11,
    fontWeight: '700',
  },
  alertCard: {
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
  },
  alertCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  alertTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  alertTime: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  alertMessage: {
    fontSize: 12,
    lineHeight: 16,
  },
  bookingActionPill: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  bookingActionText: {
    color: '#0084FF',
    fontSize: 11,
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0084FF',
    marginLeft: 8,
    marginTop: 4,
  },
  emptyCard: {
    padding: 32,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  clearAllText: {
    color: '#FF453A',
    fontSize: 12,
    fontWeight: '700',
  },
});
