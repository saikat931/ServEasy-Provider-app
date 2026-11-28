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

export interface PromoBannerItem {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  ctaText: string;
  priceBadge?: string;
  iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  gradientColors: [string, string, ...string[]];
  ctaColors: [string, string, ...string[]];
  ctaTextColor: string;
  actionType: 'boost' | 'services' | 'wallet' | 'share';
}

const DEFAULT_PROMOS: PromoBannerItem[] = [
  {
    id: 'boost_profile',
    tag: 'FEATURED • PROMO',
    title: 'Boost Your Profile #1',
    subtitle: 'Get 3× more local bookings • 7 Days @ ₹199',
    ctaText: 'Boost Now →',
    priceBadge: '₹199',
    iconName: 'rocket-launch',
    iconColor: '#A855F7',
    gradientColors: ['#2E1065', '#3B0764', '#1E1B4B'],
    ctaColors: ['#EAB308', '#22C55E'],
    ctaTextColor: '#000000',
    actionType: 'boost',
  },
  {
    id: 'tools_discount',
    tag: 'PARTNER DEAL',
    title: '20% OFF Toolkit & Spares',
    subtitle: 'Exclusive deals on pro electrical & wash kits',
    ctaText: 'Claim Offer →',
    priceBadge: '20% OFF',
    iconName: 'toolbox',
    iconColor: '#38BDF8',
    gradientColors: ['#0C4A6E', '#082F49', '#064E3B'],
    ctaColors: ['#38BDF8', '#0EA5E9'],
    ctaTextColor: '#FFFFFF',
    actionType: 'share',
  },
  {
    id: 'zero_commission',
    tag: 'WEEKEND SPECIAL',
    title: '0% Platform Fee Sunday',
    subtitle: 'Keep 100% of all cash & online earnings this weekend',
    ctaText: 'View Details →',
    priceBadge: 'FREE',
    iconName: 'crown',
    iconColor: '#F59E0B',
    gradientColors: ['#78350F', '#451A03', '#1F2937'],
    ctaColors: ['#F59E0B', '#D97706'],
    ctaTextColor: '#000000',
    actionType: 'wallet',
  },
  {
    id: 'instant_payout',
    tag: 'FAST SETTLEMENT',
    title: 'Instant Daily Payouts',
    subtitle: 'Direct transfer to your linked bank account or UPI ID with 0% fee',
    ctaText: 'View Wallet →',
    priceBadge: '0% FEE',
    iconName: 'lightning-bolt-circle',
    iconColor: '#10B981',
    gradientColors: ['#064E3B', '#022C22', '#111827'],
    ctaColors: ['#10B981', '#059669'],
    ctaTextColor: '#FFFFFF',
    actionType: 'wallet',
  },
];

interface PromoBannerCarouselProps {
  theme: 'dark' | 'light';
  onActionPress?: (action: PromoBannerItem['actionType']) => void;
}

export const PromoBannerCarousel: React.FC<PromoBannerCarouselProps> = ({
  theme,
  onActionPress,
}) => {
  const isDark = theme === 'dark';
  const scrollRef = useRef<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isUserInteracting = useRef(false);

  // Auto-slide carousel timer every 4.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      if (isUserInteracting.current) return;
      const nextIndex = (activeIndex + 1) % DEFAULT_PROMOS.length;
      scrollRef.current?.scrollTo({
        x: nextIndex * (CARD_WIDTH + CARD_SPACING),
        animated: true,
      });
      setActiveIndex(nextIndex);
    }, 4500);

    return () => clearInterval(timer);
  }, [activeIndex]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + CARD_SPACING));
    if (index >= 0 && index < DEFAULT_PROMOS.length && index !== activeIndex) {
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
        {DEFAULT_PROMOS.map((promo, idx) => (
          <View key={promo.id} style={styles.cardWrap}>
            <LinearGradient
              colors={promo.gradientColors}
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
                  <Text style={styles.tagPillText}>{promo.tag}</Text>
                </View>

                {/* Title */}
                <Text style={styles.promoTitle} numberOfLines={1}>
                  {promo.title}
                </Text>

                {/* Subtitle */}
                <Text style={styles.promoSubtitle} numberOfLines={2}>
                  {promo.subtitle}
                </Text>

                {/* CTA Button */}
                <TouchableOpacity
                  onPress={() => onActionPress?.(promo.actionType)}
                  activeOpacity={0.85}
                  style={styles.ctaBtnWrap}
                >
                  <LinearGradient
                    colors={promo.ctaColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.ctaBtnGradient}
                  >
                    <Text style={[styles.ctaBtnText, { color: promo.ctaTextColor }]}>
                      {promo.ctaText}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Right Illustration & Badge Area */}
              <View style={styles.rightContent}>
                <View style={[styles.iconHalo, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                  <MaterialCommunityIcons
                    name={promo.iconName}
                    size={46}
                    color={promo.iconColor}
                  />
                </View>

                {promo.priceBadge && (
                  <View style={styles.priceBadgePill}>
                    <Text style={styles.priceBadgeText}>{promo.priceBadge}</Text>
                  </View>
                )}
              </View>
            </LinearGradient>
          </View>
        ))}
      </ScrollView>

      {/* Pagination Dot Indicators */}
      <View style={styles.dotsRow}>
        {DEFAULT_PROMOS.map((_, dotIdx) => {
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
    marginTop: 4,
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
