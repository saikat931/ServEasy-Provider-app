import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const INDIA_SKYLINE_IMAGE = require('../../assets/india_architecture.png');

interface ProudMadeInIndiaFooterProps {
  theme: 'dark' | 'light';
}

/**
 * Clean bottom-of-Overview signature featuring "Proudly Made in India by S.S.R"
 * paired with a copyright-free Indian architectural skyline line-art illustration.
 */
export const ProudMadeInIndiaFooter: React.FC<ProudMadeInIndiaFooterProps> = ({ theme }) => {
  const isDark = theme === 'dark';
  const primaryInk = isDark ? 'rgba(255, 255, 255, 0.88)' : '#1E293B';
  const secondaryInk = isDark ? 'rgba(255, 255, 255, 0.65)' : '#475569';
  const authorInk = isDark ? 'rgba(255, 255, 255, 0.78)' : '#334155';
  const skylineTint = isDark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(30, 41, 59, 0.22)';

  return (
    <View style={styles.container}>
      <View style={styles.textBlock}>
        <Text style={[styles.proudlyText, { color: secondaryInk }]}>Proudly Made</Text>

        <View style={styles.indiaRow}>
          <Text style={[styles.indiaText, { color: primaryInk }]}>in India</Text>
          <View style={styles.heartBadge}>
            <MaterialCommunityIcons name="heart" size={14} color="#FFB800" />
          </View>
        </View>

        <Text style={[styles.authorText, { color: authorInk }]}>by S.S.R</Text>
      </View>

      <View style={styles.skylineWrap}>
        <Image
          source={INDIA_SKYLINE_IMAGE}
          style={[styles.skylineImage, { tintColor: skylineTint }]}
          resizeMode="contain"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 28,
    marginHorizontal: -16,
    paddingTop: 12,
    alignItems: 'center',
  },
  textBlock: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  proudlyText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
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
  },
  heartBadge: {
    marginLeft: 3,
    marginTop: 2,
    transform: [{ rotate: '12deg' }],
  },
  authorText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginTop: 3,
  },
  skylineWrap: {
    width: '100%',
    marginTop: 6,
  },
  skylineImage: {
    width: '100%',
    aspectRatio: 1080 / 372,
  },
});
