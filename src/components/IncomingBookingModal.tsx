import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RingtoneService } from '../services/RingtoneService';

interface IncomingBookingModalProps {
  visible: boolean;
  booking: any;
  onAccept: (booking: any) => Promise<void> | void;
  onDecline: (booking: any) => Promise<void> | void;
  onExpire?: (booking: any) => void;
  theme?: 'light' | 'dark';
}

export const IncomingBookingModal: React.FC<IncomingBookingModalProps> = ({
  visible,
  booking,
  onAccept,
  onDecline,
  onExpire,
  theme = 'dark',
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [isDeclining, setIsDeclining] = useState<boolean>(false);

  // Countdown timer ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (visible && booking) {
      setSecondsRemaining(60);
      setIsAccepting(false);
      setIsDeclining(false);

      // Start looping ringtone & vibration immediately
      const bookingId = booking.numericId || booking.id || booking.booking_id || 'new_booking';
      RingtoneService.startRinging(bookingId);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            RingtoneService.stopRinging();
            if (onExpire) onExpire(booking);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      RingtoneService.stopRinging();
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      RingtoneService.stopRinging();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, booking]);

  if (!visible || !booking) {
    return null;
  }

  const isDark = theme === 'dark';

  const bookingNumber =
    booking.bookingNumber ||
    booking.booking_number ||
    `#${booking.numericId || booking.id || booking.booking_id || 'NEW'}`;
  const customerName =
    booking.customerName ||
    booking.customer_name ||
    'Customer';
  const serviceName =
    booking.serviceName ||
    booking.service_name ||
    'Service Booking';
  const price =
    typeof booking.price === 'number' && !isNaN(booking.price)
      ? booking.price
      : parseFloat(booking.total_amount || booking.price || '0') || 0;
  const address =
    booking.address ||
    (booking.locationType === 'shop' ? 'At Provider Shop / Center' : 'Doorstep Service');
  const paymentMethod =
    booking.paymentMethod ||
    booking.payment_method ||
    'Cash on Delivery';

  const handleAcceptPress = async () => {
    setIsAccepting(true);
    RingtoneService.stopRinging();
    try {
      await onAccept(booking);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDeclinePress = async () => {
    setIsDeclining(true);
    RingtoneService.stopRinging();
    try {
      await onDecline(booking);
    } finally {
      setIsDeclining(false);
    }
  };

  const progressPercent = Math.max(0, Math.min(100, (secondsRemaining / 60) * 100));

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={handleDeclinePress}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.cardContainer,
            {
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
            },
          ]}
        >
          {/* Top Live Banner & Timer */}
          <View style={styles.headerRow}>
            <View style={styles.liveTag}>
              <View style={styles.liveDot} />
              <Text style={styles.liveTagText}>INCOMING LIVE BOOKING</Text>
            </View>
            <View style={styles.timerBadge}>
              <MaterialCommunityIcons name="timer-sand" size={16} color="#FF9500" />
              <Text style={styles.timerText}>{secondsRemaining}s</Text>
            </View>
          </View>

          {/* Countdown Linear Bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: secondsRemaining > 20 ? '#0084FF' : '#FF453A',
                },
              ]}
            />
          </View>

          {/* Service & Price Highlight Row */}
          <View style={styles.highlightBox}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="lightning-bolt" size={26} color="#0084FF" />
            </View>
            <View style={styles.serviceDetails}>
              <Text style={[styles.serviceTitle, { color: isDark ? '#FFFFFF' : '#111827' }]} numberOfLines={1}>
                {serviceName}
              </Text>
              <Text style={[styles.bookingIdText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                {bookingNumber} • {String(paymentMethod).toUpperCase()}
              </Text>
            </View>
            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>PAYOUT</Text>
              <Text style={styles.priceValue}>₹{price.toFixed(0)}</Text>
            </View>
          </View>

          {/* Customer & Address Details */}
          <View
            style={[
              styles.detailsCard,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6' },
            ]}
          >
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="account" size={18} color="#0084FF" />
              <Text style={[styles.detailTextBold, { color: isDark ? '#FFFFFF' : '#1F2937' }]}>
                {customerName}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="map-marker-outline" size={18} color="#10B981" />
              <Text
                style={[styles.detailText, { color: isDark ? '#D1D5DB' : '#4B5563' }]}
                numberOfLines={2}
              >
                {address}
              </Text>
            </View>

            {Boolean(booking.time) && (
              <View style={styles.detailRow}>
                <MaterialCommunityIcons name="clock-outline" size={18} color="#F59E0B" />
                <Text style={[styles.detailText, { color: isDark ? '#D1D5DB' : '#4B5563' }]}>
                  {booking.date ? `${booking.date} at ` : ''}{booking.time}
                </Text>
              </View>
            )}
          </View>

          {/* Accept / Decline Action Buttons */}
          <View style={styles.actionRow}>
            {/* Decline Button */}
            <TouchableOpacity
              style={[
                styles.declineButton,
                {
                  borderColor: isDark ? 'rgba(255,69,58,0.5)' : '#FECACA',
                  backgroundColor: isDark ? 'rgba(255,69,58,0.15)' : '#FEF2F2',
                },
              ]}
              onPress={handleDeclinePress}
              disabled={isAccepting || isDeclining}
              activeOpacity={0.7}
            >
              {isDeclining ? (
                <ActivityIndicator size="small" color="#FF453A" />
              ) : (
                <>
                  <MaterialCommunityIcons name="close" size={20} color="#FF453A" />
                  <Text style={styles.declineButtonText}>Decline</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Accept Button */}
            <TouchableOpacity
              style={[
                styles.acceptButton,
                {
                  opacity: isAccepting || isDeclining ? 0.7 : 1,
                },
              ]}
              onPress={handleAcceptPress}
              disabled={isAccepting || isDeclining}
              activeOpacity={0.8}
            >
              {isAccepting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="check-bold" size={20} color="#FFFFFF" />
                  <Text style={styles.acceptButtonText}>ACCEPT NOW</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 18,
      },
      android: {
        elevation: 24,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 132, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0084FF',
    marginRight: 6,
  },
  liveTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0084FF',
    letterSpacing: 0.5,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FF9500',
    marginLeft: 4,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  highlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 132, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  serviceDetails: {
    flex: 1,
  },
  serviceTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  bookingIdText: {
    fontSize: 12,
    fontWeight: '600',
  },
  priceContainer: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  priceLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  priceValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10B981',
  },
  detailsCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailTextBold: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 10,
  },
  detailText: {
    fontSize: 13,
    marginLeft: 10,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF453A',
  },
  acceptButton: {
    flex: 2,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0084FF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#0084FF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
