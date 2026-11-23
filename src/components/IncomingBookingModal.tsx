import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ProviderBooking } from '../services/api';
import { RingtoneService } from '../services/RingtoneService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface IncomingBookingModalProps {
  visible: boolean;
  booking: ProviderBooking | any | null;
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

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.7)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT * 0.4)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;

  // Countdown timer ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (visible && booking) {
      setSecondsRemaining(60);
      setIsAccepting(false);
      setIsDeclining(false);

      // Start looping ringtone immediately
      const bookingId = booking.numericId || booking.id || booking.booking_id || 'new_booking';
      RingtoneService.startRinging(bookingId);

      // Slide in card
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 9,
        useNativeDriver: true,
      }).start();

      // Start pulsing radar
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.45,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1.0,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseOpacity, {
              toValue: 0.15,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(pulseOpacity, {
              toValue: 0.7,
              duration: 1200,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();

      // Countdown timer
      progressAnim.setValue(1);
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: 60000,
        useNativeDriver: false,
      }).start();

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            // Expired!
            RingtoneService.stopRinging();
            if (onExpire) onExpire(booking);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Stopped/Dismissed
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
    typeof booking.price === 'number'
      ? booking.price
      : parseFloat(booking.total_amount || booking.price || '0');
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

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleDeclinePress}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Pulsing Radar Ring Behind Card */}
        <Animated.View
          style={[
            styles.radarPulse,
            {
              transform: [{ scale: pulseAnim }],
              opacity: pulseOpacity,
            },
          ]}
        />

        <Animated.View
          style={[
            styles.cardContainer,
            {
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Top Live Banner & Timer */}
          <View style={styles.headerRow}>
            <View style={styles.liveTag}>
              <View style={styles.liveDot} />
              <Text style={styles.liveTagText}>INCOMING SERVICE REQUEST</Text>
            </View>
            <View style={styles.timerBadge}>
              <MaterialCommunityIcons name="timer-sand" size={16} color="#FF9500" />
              <Text style={styles.timerText}>{secondsRemaining}s</Text>
            </View>
          </View>

          {/* Countdown Linear Bar */}
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                  backgroundColor: secondsRemaining > 20 ? '#0084FF' : '#FF453A',
                },
              ]}
            />
          </View>

          {/* Service & Price Highlight Row */}
          <View style={styles.highlightBox}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="lightning-bolt" size={28} color="#0084FF" />
            </View>
            <View style={styles.serviceDetails}>
              <Text style={[styles.serviceTitle, { color: isDark ? '#FFFFFF' : '#111827' }]} numberOfLines={1}>
                {serviceName}
              </Text>
              <Text style={[styles.bookingIdText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                {bookingNumber} • {paymentMethod.toUpperCase()}
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
              { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB' },
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

            {booking.time && (
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
                  borderColor: isDark ? 'rgba(255,69,58,0.4)' : '#FECACA',
                  backgroundColor: isDark ? 'rgba(255,69,58,0.1)' : '#FEF2F2',
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
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  radarPulse: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_WIDTH * 0.9,
    borderRadius: (SCREEN_WIDTH * 0.9) / 2,
    borderWidth: 3,
    borderColor: '#0084FF',
    backgroundColor: 'rgba(0, 132, 255, 0.08)',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 22,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      android: {
        elevation: 20,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 18,
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
    width: 48,
    height: 48,
    borderRadius: 24,
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
    marginBottom: 20,
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
