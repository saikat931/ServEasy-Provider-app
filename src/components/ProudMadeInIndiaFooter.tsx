import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const INDIA_SKYLINE_IMAGE = require('../../assets/india_architecture.png');

interface ProudMadeInIndiaFooterProps {
  theme: 'dark' | 'light';
}

/**
 * Bottom-of-Overview signature overlaying "Proudly Made in India by S.S.R"
 * directly over a copyright-free panoramic Indian architectural skyline.
 */
export const ProudMadeInIndiaFooter: React.FC<ProudMadeInIndiaFooterProps> = ({ theme }) => {
  const isDark = theme === 'dark';
  const primaryInk = isDark ? 'rgba(255, 255, 255, 0.94)' : '#0F172A';
  const secondaryInk = isDark ? 'rgba(255, 255, 255, 0.78)' : '#334155';
  const authorInk = isDark ? 'rgba(255, 255, 255, 0.88)' : '#1E293B';
  const skylineTint = isDark ? 'rgba(255, 255, 255, 0.19)' : 'rgba(15, 23, 42, 0.17)';
  const haloColor = isDark ? 'rgba(8, 9, 12, 0.92)' : 'rgba(235, 245, 255, 0.95)';

  return (
    <View style={styles.container}>
      <View style={styles.skylineWrap}>
        <Image
          source={INDIA_SKYLINE_IMAGE}
          style={[styles.skylineImage, { tintColor: skylineTint }]}
          resizeMode="contain"
        />

        <View style={styles.overlayTextBlock} pointerEvents="none">
          <Text style={[styles.proudlyText, { color: secondaryInk, textShadowColor: haloColor }]}>
            Proudly Made
          </Text>

          <View style={styles.indiaRow}>
            <Text style={[styles.indiaText, { color: primaryInk, textShadowColor: haloColor }]}>
              in India
            </Text>
            <View style={styles.heartBadge}>
              <MaterialCommunityIcons name="heart" size={14} color="#FFB800" />
            </View>
          </View>

          <Text style={[styles.authorText, { color: authorInk, textShadowColor: haloColor }]}>
            by S.S.R
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 'auto',
    paddingTop: 20,
    marginBottom: -24,
    marginHorizontal: -16,
    alignItems: 'center',
  },
  skylineWrap: {
    width: '100%',
    height: 165,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skylineImage: {
    width: '100%',
    height: '100%',
  },
  overlayTextBlock: {
    position: 'absolute',
    top: '18%',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 2,
  },
  proudlyText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  indiaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 1,
  },
  indiaText: {
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  heartBadge: {
    marginLeft: 3,
    marginTop: 2,
    transform: [{ rotate: '12deg' }],
  },
  authorText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginTop: 3,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
});
