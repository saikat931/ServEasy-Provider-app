import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48; // Leaves a neat peek on the right edge
const CARD_SPACING = 12;

export interface WhyPartnerItem {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  ctaText: string;
  badge?: string;
  iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  gradientColors: [string, string, ...string[]];
  ctaColors: [string, string, ...string[]];
  ctaTextColor: string;
}

const WHY_PARTNER_BENEFITS: WhyPartnerItem[] = [
  {
    id: 'live_bookings',
    tag: '⚡ REAL-TIME DISPATCH',
    title: 'Instant Live Bookings',
    subtitle: 'Direct customer requests with sound & push notifications in your service area',
    ctaText: 'Start Earning →',
    badge: 'INSTANT',
    iconName: 'lightning-bolt',
    iconColor: '#FF9500',
    gradientColors: ['#7C2D12', '#9A3412', '#1E1B4B'],
    ctaColors: ['#F59E0B', '#D97706'],
    ctaTextColor: '#000000',
  },
  {
    id: 'direct_payouts',
    tag: '💰 0% DEDUCTION',
    title: 'Guaranteed Payouts',
    subtitle: 'Direct into linked bank account or UPI ID with 0% hidden commissions',
    ctaText: 'View Payouts →',
    badge: '100% UPI',
    iconName: 'bank-transfer',
    iconColor: '#30D158',
    gradientColors: ['#064E3B', '#047857', '#0F172A'],
    ctaColors: ['#30D158', '#059669'],
    ctaTextColor: '#000000',
  },
  {
    id: 'coverage_radius',
    tag: '📍 FLEXIBLE PERIMETER',
    title: 'Custom Coverage Radius',
    subtitle: 'Define your operating perimeter from 5 km to 30 km. Only jobs you want',
    ctaText: 'Set Radius →',
    badge: '5 - 30 KM',
    iconName: 'map-marker-radius',
    iconColor: '#38BDF8',
    gradientColors: ['#0C4A6E', '#0369A1', '#0F172A'],
    ctaColors: ['#38BDF8', '#0284C7'],
    ctaTextColor: '#FFFFFF',
  },
  {
    id: 'trust_badge',
    tag: '🛡️ 4-PILLAR TRUST',
    title: 'Verified Partner Badge',
    subtitle: 'Verified phone, email, address, and ID badges help you win more customers',
    ctaText: 'Get Verified →',
    badge: 'TOP RATED',
    iconName: 'shield-check',
    iconColor: '#A855F7',
    gradientColors: ['#3B0764', '#581C87', '#1E1B4B'],
    ctaColors: ['#A855F7', '#7C3AED'],
    ctaTextColor: '#FFFFFF',
  },
  {
    id: 'zero_joining_fee',
    tag: '🎉 LIFETIME FREE',
    title: '0% Joining Fee',
    subtitle: 'Zero registration fee or monthly membership lock-in. Keep max earnings',
    ctaText: 'Join Free →',
    badge: 'FREE ENTRY',
    iconName: 'tag-off',
    iconColor: '#F43F5E',
    gradientColors: ['#881337', '#BE123C', '#0F172A'],
    ctaColors: ['#F43F5E', '#E11D48'],
    ctaTextColor: '#FFFFFF',
  },
  {
    id: 'support_24_7',
    tag: '📞 PRIORITY HOTLINE',
    title: '24/7 Dedicated Support',
    subtitle: 'Direct hotline & in-app priority assistance for all ServEasy verified partners',
    ctaText: 'Contact Support →',
    badge: '24/7 LIVE',
    iconName: 'headphones',
    iconColor: '#6366F1',
    gradientColors: ['#312E81', '#4338CA', '#0F172A'],
    ctaColors: ['#6366F1', '#4F46E5'],
    ctaTextColor: '#FFFFFF',
  },
];

interface WhyPartnerCarouselProps {
  theme: 'dark' | 'light';
  onActionPress?: (item: WhyPartnerItem) => void;
}

export const WhyPartnerCarousel: React.FC<WhyPartnerCarouselProps> = ({
  theme,
  onActionPress,
}) => {
  const isDark = theme === 'dark';
  const scrollRef = useRef<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isUserInteracting = useRef(false);

  // Auto-slide carousel timer every 4.2 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (isUserInteracting.current) return;
      const nextIndex = (activeIndex + 1) % WHY_PARTNER_BENEFITS.length;
      scrollRef.current?.scrollTo({
        x: nextIndex * (CARD_WIDTH + CARD_SPACING),
        animated: true,
      });
      setActiveIndex(nextIndex);
    }, 4200);

    return () => clearInterval(timer);
  }, [activeIndex]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + CARD_SPACING));
    if (index >= 0 && index < WHY_PARTNER_BENEFITS.length && index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        snapToAlignment="start"
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onTouchStart={() => {
          isUserInteracting.current = true;
        }}
        onTouchEnd={() => {
          setTimeout(() => {
            isUserInteracting.current = false;
          }, 4000);
        }}
      >
        {WHY_PARTNER_BENEFITS.map((item) => (
          <View key={item.id} style={styles.cardWrap}>
            <LinearGradient
              colors={item.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.gradientCard,
                {
                  borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)',
                },
              ]}
            >
              {/* Left Content Area */}
              <View style={styles.leftContent}>
                {/* Pill Tag */}
                <View style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{item.tag}</Text>
                </View>

                {/* Title */}
                <Text style={styles.promoTitle} numberOfLines={1}>
                  {item.title}
                </Text>

                {/* Subtitle */}
                <Text style={styles.promoSubtitle} numberOfLines={2}>
                  {item.subtitle}
                </Text>

                {/* CTA Button */}
                <TouchableOpacity
                  onPress={() => onActionPress?.(item)}
                  activeOpacity={0.85}
                  style={styles.ctaBtnWrap}
                >
                  <LinearGradient
                    colors={item.ctaColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ctaBtnGradient}
                  >
                    <Text style={[styles.ctaBtnText, { color: item.ctaTextColor }]}>
                      {item.ctaText}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Right Illustration & Badge Area */}
              <View style={styles.rightContent}>
                <View style={[styles.iconHalo, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                  <MaterialCommunityIcons
                    name={item.iconName}
                    size={46}
                    color={item.iconColor}
                  />
                </View>

                {item.badge && (
                  <View style={styles.priceBadgePill}>
                    <Text style={styles.priceBadgeText}>{item.badge}</Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </View>
        ))}
      </ScrollView>

      {/* Pagination Dot Indicators */}
      <View style={styles.dotsRow}>
        {WHY_PARTNER_BENEFITS.map((_, dotIdx) => {
          const isActive = activeIndex === dotIdx;
          return (
            <TouchableOpacity
              key={dotIdx}
              onPress={() => {
                scrollRef.current?.scrollTo({
                  x: dotIdx * (CARD_WIDTH + CARD_SPACING),
                  animated: true,
                });
                setActiveIndex(dotIdx);
              }}
              style={[
                styles.dot,
                isActive ? styles.dotActive : styles.dotInactive,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 20,
    marginTop: 8,
  },
  scrollContent: {
    paddingRight: 16,
  },
  cardWrap: {
    width: CARD_WIDTH,
    marginRight: CARD_SPACING,
  },
  gradientCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 145,
    overflow: 'hidden',
  },
  leftContent: {
    flex: 1,
    paddingRight: 10,
    alignItems: 'flex-start',
  },
  tagPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginBottom: 8,
  },
  tagPillText: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  promoTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  promoSubtitle: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '500',
    marginBottom: 12,
  },
  ctaBtnWrap: {
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  ctaBtnGradient: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  ctaBtnText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  rightContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 86,
  },
  iconHalo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceBadgePill: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginTop: -8,
  },
  priceBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  dotActive: {
    width: 22,
    backgroundColor: '#0084FF',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
});
