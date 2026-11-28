import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface IdApprovalModalProps {
  visible: boolean;
  onClose: () => void;
  status?: string; // 'under_review' | 'pending' | 'rejected' | 'not_submitted' | string
  onOpenVerification: () => void;
  theme?: 'dark' | 'light';
}

export function IdApprovalModal({
  visible,
  onClose,
  status = 'pending',
  onOpenVerification,
  theme = 'dark',
}: IdApprovalModalProps) {
  if (!visible) return null;

  const isDark = theme === 'dark';
  const normStatus = (status || 'pending').toLowerCase();
  const isUnderReview = normStatus === 'under_review' || normStatus === 'review';
  const isRejected = normStatus === 'rejected';

  // Dynamic configuration based on ID verification state
  let heroIcon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] = 'shield-alert';
  let badgeLabel = 'ID VERIFICATION REQUIRED';
  let badgeColors: [string, string] = ['rgba(0, 132, 255, 0.25)', 'rgba(0, 98, 204, 0.15)'];
  let badgeTextColor = '#38BDF8';
  let badgeIcon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] = 'shield-lock';
  let iconGlowColor = 'rgba(0, 132, 255, 0.18)';
  let iconBorderColor = 'rgba(0, 132, 255, 0.35)';
  let iconGradColors: [string, string] = ['#0084FF', '#0055B3'];
  let title = 'ID Approval Required 🛡️';
  let description =
    'Please complete your ID verification and submit official proof. Once approved by Admin or Superadmin, you can go Online.';
  let primaryCtaText = 'Submit / View ID 🪪';
  let primaryCtaColors: [string, string] = ['#0084FF', '#0062CC'];

  if (isUnderReview) {
    heroIcon = 'clock-outline';
    badgeLabel = 'UNDER ADMIN REVIEW';
    badgeColors = ['rgba(245, 158, 11, 0.25)', 'rgba(217, 119, 6, 0.15)'];
    badgeTextColor = '#F59E0B';
    badgeIcon = 'clock-fast';
    iconGlowColor = 'rgba(245, 158, 11, 0.2)';
    iconBorderColor = 'rgba(245, 158, 11, 0.4)';
    iconGradColors = ['#F59E0B', '#D97706'];
    title = 'Verification Under Review ⏳';
    description =
      'Your Government ID & documents have been submitted and are currently being reviewed by the admin team. You will be able to go Online as soon as approval is granted.';
    primaryCtaText = 'Check Verification Status 🔍';
    primaryCtaColors = ['#F59E0B', '#D97706'];
  } else if (isRejected) {
    heroIcon = 'alert-decagram';
    badgeLabel = 'ACTION REQUIRED • REJECTED';
    badgeColors = ['rgba(239, 68, 68, 0.25)', 'rgba(220, 38, 38, 0.15)'];
    badgeTextColor = '#EF4444';
    badgeIcon = 'alert-circle';
    iconGlowColor = 'rgba(239, 68, 68, 0.2)';
    iconBorderColor = 'rgba(239, 68, 68, 0.4)';
    iconGradColors = ['#EF4444', '#DC2626'];
    title = 'ID Verification Rejected ⚠️';
    description =
      'Your previous ID verification was rejected by Admin. Please re-submit clear, valid ID documents to get approved and start taking orders.';
    primaryCtaText = 'Re-Submit Documents 🪪';
    primaryCtaColors = ['#EF4444', '#B91C1C'];
  }

  const cardBg = isDark ? '#111827' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
  const titleColor = isDark ? '#FFFFFF' : '#0F172A';
  const descColor = isDark ? '#9CA3AF' : '#64748B';
  const rowBg = isDark ? 'rgba(255, 255, 255, 0.04)' : '#F8FAFC';
  const rowBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {/* Tap outside to dismiss */}
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        {/* Modal Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: cardBg,
              borderColor: cardBorder,
            },
          ]}
        >
          {/* Top Drag Indicator */}
          <View style={styles.topBar}>
            <View style={[styles.topBarPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#CBD5E1' }]} />
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              style={[styles.closeIconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}
            >
              <MaterialCommunityIcons name="close" size={18} color={isDark ? '#9CA3AF' : '#64748B'} />
            </TouchableOpacity>
          </View>

          {/* Hero Visual: Glowing Concentric Rings with Shield */}
          <View style={styles.heroWrap}>
            <View style={[styles.glowRingOuter, { backgroundColor: iconGlowColor }]}>
              <View style={[styles.glowRingMiddle, { borderColor: iconBorderColor }]}>
                <LinearGradient
                  colors={iconGradColors}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroCircle}
                >
                  <MaterialCommunityIcons name={heroIcon} size={36} color="#FFFFFF" />
                </LinearGradient>
              </View>
            </View>

            {/* Status Pill Badge */}
            <LinearGradient
              colors={badgeColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.badgePill, { borderColor: badgeTextColor }]}
            >
              <MaterialCommunityIcons
                name={badgeIcon}
                size={13}
                color={badgeTextColor}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.badgeText, { color: badgeTextColor }]}>
                {badgeLabel}
              </Text>
            </LinearGradient>
          </View>

          {/* Title & Description */}
          <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
          <Text style={[styles.description, { color: descColor }]}>{description}</Text>

          {/* Verification Steps Breakdown */}
          <View style={[styles.stepsCard, { backgroundColor: rowBg, borderColor: rowBorder }]}>
            {/* Step 1 */}
            <View style={styles.stepRow}>
              <View style={[styles.stepIconBox, { backgroundColor: isUnderReview ? 'rgba(245, 158, 11, 0.15)' : isRejected ? 'rgba(239, 68, 68, 0.15)' : 'rgba(0, 132, 255, 0.15)' }]}>
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={18}
                  color={isUnderReview ? '#F59E0B' : isRejected ? '#EF4444' : '#0084FF'}
                />
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepTitle, { color: titleColor }]}>
                  Government ID Proof
                </Text>
                <Text style={[styles.stepSubtitle, { color: descColor }]}>
                  Aadhaar, Voter ID, or Driving License
                </Text>
              </View>
              <View
                style={[
                  styles.statusTag,
                  {
                    backgroundColor: isUnderReview
                      ? 'rgba(245, 158, 11, 0.15)'
                      : isRejected
                      ? 'rgba(239, 68, 68, 0.15)'
                      : 'rgba(255, 255, 255, 0.08)',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusTagText,
                    {
                      color: isUnderReview
                        ? '#F59E0B'
                        : isRejected
                        ? '#EF4444'
                        : isDark
                        ? '#CBD5E1'
                        : '#64748B',
                    },
                  ]}
                >
                  {isUnderReview ? 'Submitted' : isRejected ? 'Rejected' : 'Required'}
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: rowBorder }]} />

            {/* Step 2 */}
            <View style={styles.stepRow}>
              <View style={[styles.stepIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <MaterialCommunityIcons name="face-recognition" size={18} color="#10B981" />
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepTitle, { color: titleColor }]}>
                  Live Facial Verification
                </Text>
                <Text style={[styles.stepSubtitle, { color: descColor }]}>
                  Selfie match with government photo ID
                </Text>
              </View>
              <View style={[styles.statusTag, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Text style={[styles.statusTagText, { color: '#10B981' }]}>
                  Quick Check
                </Text>
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: rowBorder }]} />

            {/* Step 3 */}
            <View style={styles.stepRow}>
              <View style={[styles.stepIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                <MaterialCommunityIcons name="shield-check" size={18} color="#A855F7" />
              </View>
              <View style={styles.stepContent}>
                <Text style={[styles.stepTitle, { color: titleColor }]}>
                  Admin Verification & Duty
                </Text>
                <Text style={[styles.stepSubtitle, { color: descColor }]}>
                  Instant Online switch activation upon approval
                </Text>
              </View>
              <View style={[styles.statusTag, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                <Text style={[styles.statusTagText, { color: '#A855F7' }]}>
                  15-30 Min
                </Text>
              </View>
            </View>
          </View>

          {/* Trust Highlights Strip */}
          <View
            style={[
              styles.trustBox,
              {
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.06)',
                borderColor: isDark ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.2)',
              },
            ]}
          >
            <MaterialCommunityIcons
              name="check-decagram"
              size={18}
              color="#10B981"
              style={{ marginRight: 8, marginTop: 1 }}
            />
            <Text style={[styles.trustText, { color: isDark ? '#A7F3D0' : '#065F46' }]}>
              Verified providers earn <Text style={{ fontWeight: '700' }}>3× more bookings</Text> and receive instant 100% direct bank / UPI payouts.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsWrap}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                onClose();
                onOpenVerification();
              }}
              style={styles.primaryBtnTouch}
            >
              <LinearGradient
                colors={primaryCtaColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryBtnGrad}
              >
                <MaterialCommunityIcons
                  name={isUnderReview ? 'magnify' : 'arrow-right-circle'}
                  size={20}
                  color="#FFFFFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.primaryBtnText}>{primaryCtaText}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onClose}
              style={[
                styles.cancelBtn,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                },
              ]}
            >
              <Text style={[styles.cancelBtnText, { color: isDark ? '#9CA3AF' : '#64748B' }]}>
                Stay Offline For Now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1.5,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    position: 'relative',
  },
  topBarPill: {
    width: 44,
    height: 4,
    borderRadius: 2,
  },
  closeIconBtn: {
    position: 'absolute',
    right: 0,
    top: -4,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  glowRingOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  glowRingMiddle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    borderRadius: 14,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 13,
    lineHeight: 18.5,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 6,
  },
  stepsCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  stepIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 1,
  },
  stepSubtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusTagText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    width: '100%',
    marginVertical: 2,
  },
  trustBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  trustText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
  },
  actionsWrap: {
    gap: 8,
  },
  primaryBtnTouch: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cancelBtn: {
    width: '100%',
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
