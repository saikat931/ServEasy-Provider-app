import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export interface ServerConnectionModalProps {
  visible: boolean;
  onClose: () => void;
  onRetry?: () => void;
  theme?: 'dark' | 'light';
  activeTheme?: any;
  title?: string;
  message?: string;
  asOverlay?: boolean;
}

export function ServerConnectionModal({
  visible,
  onClose,
  onRetry,
  theme = 'dark',
  activeTheme,
  title = 'Unable to Connect',
  message = "We couldn't reach the ServEasy server. Please verify your mobile data or Wi-Fi and try again.",
  asOverlay = false,
}: ServerConnectionModalProps) {
  if (!visible) return null;

  const isDark = theme === 'dark';
  const cardBg = isDark ? '#161C26' : '#FFFFFF';
  const titleColor = isDark ? '#FFFFFF' : '#0F172A';
  const messageColor = isDark ? 'rgba(255, 255, 255, 0.72)' : '#64748B';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  const content = (
    <View style={asOverlay ? styles.overlayContainer : styles.modalBackdrop}>
      {/* Background Dim Backdrop */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={StyleSheet.absoluteFill} />
      </TouchableWithoutFeedback>

      {/* Floating Modal Card */}
      <View
        style={[
          styles.modalCard,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
          },
        ]}
        onStartShouldSetResponder={() => true}
      >
        {/* Glowing Disconnect Icon Badge */}
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="cloud-off-outline" size={36} color="#FF453A" />
        </View>

        {/* Title */}
        <Text style={[styles.modalTitle, { color: titleColor }]}>
          {title}
        </Text>

        {/* Subtitle Message */}
        <Text style={[styles.modalMessage, { color: messageColor }]}>
          {message}
        </Text>

        {/* Connection Hint Pill */}
        <View
          style={[
            styles.hintBox,
            {
              backgroundColor: isDark ? 'rgba(255, 159, 10, 0.12)' : 'rgba(255, 159, 10, 0.08)',
              borderColor: isDark ? 'rgba(255, 159, 10, 0.28)' : 'rgba(255, 159, 10, 0.2)',
            },
          ]}
        >
          <MaterialCommunityIcons name="wifi-alert" size={16} color="#FF9F0A" style={{ marginRight: 8 }} />
          <Text style={[styles.hintText, { color: isDark ? '#FFD60A' : '#D97706' }]}>
            Check your mobile data (4G/5G) or Wi-Fi
          </Text>
        </View>

        {/* Action Buttons Column */}
        <View style={styles.actionsColumn}>
          {onRetry && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onRetry}
              style={styles.retryBtn}
            >
              <MaterialCommunityIcons name="refresh" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.retryBtnText}>Retry Connection</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClose}
            style={[
              styles.dismissBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
              },
            ]}
          >
            <Text style={[styles.dismissBtnText, { color: isDark ? '#CBD5E1' : '#475569' }]}>
              Dismiss
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (asOverlay) {
    return content;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 99999,
  },
  modalCard: {
    width: '100%',
    maxWidth: 350,
    minHeight: 380,
    borderRadius: 24,
    borderWidth: 1.2,
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 20,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 69, 58, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  modalMessage: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 22,
    width: '100%',
  },
  hintText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  actionsColumn: {
    width: '100%',
    gap: 12,
    marginTop: 4,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0084FF',
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dismissBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
  },
  dismissBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
