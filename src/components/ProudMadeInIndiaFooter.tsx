import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const INDIA_SKYLINE_IMAGE = require('../../assets/india_architecture.png');

interface ProudMadeInIndiaFooterProps {
  theme: 'dark' | 'light';
}

/**
 * Bottom-of-Overview "Proudly Made in India by S.S.R" section.
 * Text sits cleanly ABOVE the architectural skyline (Rapido-style),
 * with the line-art rendered below it at reduced opacity.
 */
export const ProudMadeInIndiaFooter: React.FC<ProudMadeInIndiaFooterProps> = ({ theme }) => {
  const isDark = theme === 'dark';

  // Text colors
  const proudlyColor  = isDark ? 'rgba(200,210,230,0.75)' : '#64748B';
  const indiaColor    = isDark ? '#FFFFFF'                 : '#0F172A';
  const authorColor   = isDark ? 'rgba(200,210,230,0.70)' : '#475569';

  // Skyline tint — subtle so it stays in the background
  const skylineTint = isDark
    ? 'rgba(255,255,255,0.14)'
    : 'rgba(30,41,59,0.13)';

  // Divider line
  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.09)';

  return (
    <View style={styles.container}>
      {/* Thin divider line */}
      <View style={[styles.divider, { backgroundColor: dividerColor }]} />

      {/* Text block — above the skyline */}
      <View style={styles.textBlock}>
        <Text style={[styles.proudlyText, { color: proudlyColor }]}>
          Proudly made
        </Text>
        <View style={styles.indiaRow}>
          <Text style={[styles.indiaText, { color: indiaColor }]}>in India</Text>
          <Text style={styles.flagEmoji}>🇮🇳</Text>
        </View>
        <Text style={[styles.authorText, { color: authorColor }]}>by S.S.R</Text>
      </View>

      {/* Skyline image — below text, as a visual watermark */}
      <Image
        source={INDIA_SKYLINE_IMAGE}
        style={[styles.skylineImage, { tintColor: skylineTint }]}
        resizeMode="cover"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 'auto',
    paddingTop: 8,
    marginBottom: -24,
    marginHorizontal: -16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  divider: {
    width: '80%',
    height: 1,
    marginBottom: 14,
    borderRadius: 1,
  },
  textBlock: {
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  proudlyText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  indiaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indiaText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  flagEmoji: {
    fontSize: 18,
    marginLeft: 5,
    marginTop: 3,
  },
  authorText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginTop: 1,
    textTransform: 'uppercase',
  },
  skylineImage: {
    width: '100%',
    height: 160,
  },
});
