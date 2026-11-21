import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated, Dimensions, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SplashProps {
  onAnimationEnd: () => void;
}

export const Splash: React.FC<SplashProps> = ({ onAnimationEnd }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const footerFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Run entering animations
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600, // Reduced from 800 for faster load feel
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Fade in footer "made by S.S.R"
      Animated.timing(footerFadeAnim, {
        toValue: 1,
        duration: 300, // Faster fade
        useNativeDriver: true,
      }).start();
    });

    // Hold screen and call onAnimationEnd (Total 1.5s for faster feel)
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        onAnimationEnd();
      });
    }, 1500); // Reduced from 2800 for much snappier startup time

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* Background Gradient */}
      <LinearGradient
        colors={['#08090A', '#16181B']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Floating Glowing Background Blob */}
      <LinearGradient
        colors={['rgba(0, 132, 255, 0.25)', 'rgba(0,0,0,0)']}
        style={styles.glowBlob}
      />

      {/* Centered Glassmorphic Logo Container */}
      <Animated.View style={[styles.centerWrapper, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        {Platform.OS === 'android' ? (
          <View style={[styles.logoGlassCard, { backgroundColor: 'rgba(25, 27, 30, 0.95)' }]}>
            <View style={styles.logoCircle}>
              <Image source={require('../../assets/logo.png')} style={styles.splashLogoImage} />
            </View>
            <Text style={styles.logoTitle}>ServEasy</Text>
            <Text style={styles.logoSubtitle}>SERVICE PROVIDER</Text>
          </View>
        ) : (
          <BlurView intensity={15} tint="dark" style={styles.logoGlassCard}>
            <View style={styles.logoCircle}>
              <Image source={require('../../assets/logo.png')} style={styles.splashLogoImage} />
            </View>
            <Text style={styles.logoTitle}>ServEasy</Text>
            <Text style={styles.logoSubtitle}>SERVICE PROVIDER</Text>
          </BlurView>
        )}
      </Animated.View>

      {/* Bottom Footer "made by S.S.R" */}
      <Animated.View style={[styles.footer, { opacity: footerFadeAnim }]}>
        <Text style={styles.footerLabel}>powered by</Text>
        <Text style={styles.footerAuthor}>S.S.R</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#08090A',
  },
  glowBlob: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_WIDTH * 0.9,
    borderRadius: (SCREEN_WIDTH * 0.9) / 2,
    top: '30%',
    left: '5%',
  },
  centerWrapper: {
    alignItems: 'center',
    zIndex: 1,
  },
  logoGlassCard: {
    paddingVertical: 32,
    paddingHorizontal: 48,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    backgroundColor: 'rgba(25, 27, 30, 0.45)',
  },
  logoCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(0, 132, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 132, 255, 0.25)',
  },
  splashLogoImage: {
    width: 98,
    height: 98,
    resizeMode: 'contain',
  },
  logoTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  logoSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A0A5AD',
    letterSpacing: 4,
    marginTop: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 48,
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  footerAuthor: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    marginTop: 4,
  },
});
