import { StyleSheet, View, ViewStyle, Platform, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassCardProps {
  theme: 'dark' | 'light';
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
}

export const GlassCard: React.FC<GlassCardProps> = ({
  theme,
  children,
  style,
  intensity,
  tint
}) => {
  // Higher opacity on Android since we don't have the blur layer
  const cardBg = Platform.OS === 'android'
    ? (theme === 'dark' ? 'rgba(20, 22, 26, 0.82)' : 'rgba(255, 255, 255, 0.85)')
    : (theme === 'dark' ? 'rgba(20, 22, 26, 0.22)' : 'rgba(255, 255, 255, 0.45)');

  const cardBorder = theme === 'dark' ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.4)';
  const defaultIntensity = intensity !== undefined ? intensity : (theme === 'dark' ? 25 : 30);
  const selectedTint = tint || (theme === 'dark' ? 'dark' : 'light');

  // Android Performance Fallback: avoid expensive screenshot capture blur rendering
  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
          },
          style
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <BlurView
      intensity={defaultIntensity}
      tint={selectedTint}
      style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
        },
        style
      ]}
    >
      {children}
    </BlurView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 3,
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      }
    })
  }
});
