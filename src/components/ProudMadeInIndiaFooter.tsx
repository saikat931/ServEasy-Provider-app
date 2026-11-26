import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

const INDIA_SKYLINE_IMAGE = require('../../assets/india_architecture.png');
const INDIA_MAP_ICON = require('../../assets/india_map_icon.png');

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
  const copyrightColor = isDark ? 'rgba(148, 163, 184, 0.58)' : 'rgba(71, 85, 105, 0.68)';

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
          <Image
            source={INDIA_MAP_ICON}
            style={styles.indiaMapIcon}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.authorText, { color: authorColor }]}>by S.S.R</Text>
      </View>

      {/* Skyline image — tucked closely beneath text */}
      <Image
        source={INDIA_SKYLINE_IMAGE}
        style={[styles.skylineImage, { tintColor: skylineTint }]}
        resizeMode="contain"
      />

      {/* Copyright notice */}
      <Text style={[styles.copyrightText, { color: copyrightColor }]}>
        © 2026 ServEasy. All Rights Reserved.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 'auto',
    paddingTop: 8,
    paddingBottom: 6,
    marginBottom: -8,
    marginHorizontal: -16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  divider: {
    width: '80%',
    height: 1,
    marginBottom: 10,
    borderRadius: 1,
  },
  textBlock: {
    alignItems: 'center',
    marginBottom: 0,
    paddingHorizontal: 16,
    zIndex: 2,
  },
  proudlyText: {
    fontSize: 12,
    lineHeight: 15,
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
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  indiaMapIcon: {
    width: 22,
    height: 22,
    marginLeft: 5,
    marginTop: 1,
  },
  authorText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginTop: 0,
    textTransform: 'uppercase',
  },
  skylineImage: {
    width: '100%',
    height: 160,
    marginTop: -18,
  },
  copyrightText: {
    fontSize: 10.5,
    fontWeight: '500',
    letterSpacing: 0.3,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
