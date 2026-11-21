import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { GlassCard } from './GlassCard';
import {
  sendProviderOtpApi,
  verifyProviderOtpApi,
  fetchOtpConfigApi,
  storeProviderUser,
  ProviderUser,
  OtpConfig,
} from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ProviderAuthModalProps {
  visible: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
  activeTheme: any;
  onLoginSuccess: (user: ProviderUser) => void;
}

export function ProviderAuthModal({
  visible,
  onClose,
  theme,
  activeTheme,
  onLoginSuccess,
}: ProviderAuthModalProps) {
  const [identity, setIdentity] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'identity' | 'otp'>('identity');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [otpConfig, setOtpConfig] = useState<OtpConfig>({
    email_otp_enabled: true,
    phone_otp_enabled: false,
    mode: 'email',
    label: 'Email Address',
    placeholder: 'Please enter your email.',
    validation_message: 'Phone number login is closed. Please enter your email.',
    input_type: 'email',
  });

  const loadConfig = async () => {
    try {
      const cfg = await fetchOtpConfigApi();
      if (cfg) {
        setOtpConfig(cfg);
      }
    } catch (e) {
      console.log('[ProviderAuthModal] Config error:', e);
    }
  };

  useEffect(() => {
    if (visible) {
      setErrorMessage(null);
      loadConfig();
    }
  }, [visible]);

  // Live identity validation matching Super Admin OTP rules exactly
  const validateIdentity = () => {
    const val = identity.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^[0-9]{10}$/;
    const cleanPhone = val.replace(/[\s\-+]/g, '');

    if (val === '') {
      setErrorMessage(null);
      return false;
    }

    if (otpConfig.mode === 'email' || !otpConfig.phone_otp_enabled) {
      // If user starts typing a phone number while phone login is closed:
      if (/^\d+$/.test(cleanPhone) || /^\d/.test(val)) {
        setErrorMessage('Phone number login is closed. Please enter your email.');
        return false;
      }
      if (!emailPattern.test(val)) {
        setErrorMessage('Please enter a valid email address.');
        return false;
      }
      setErrorMessage(null);
      return true;
    }

    if (otpConfig.mode === 'phone' || !otpConfig.email_otp_enabled) {
      if (val.includes('@')) {
        setErrorMessage('Email login is closed. Please enter your phone number.');
        return false;
      }
      if (!phonePattern.test(cleanPhone)) {
        setErrorMessage('Please enter a valid 10-digit mobile number.');
        return false;
      }
      setErrorMessage(null);
      return true;
    }

    // Both methods allowed
    if (!emailPattern.test(val) && !phonePattern.test(cleanPhone)) {
      setErrorMessage('Please enter a valid email or 10-digit mobile number.');
      return false;
    }

    setErrorMessage(null);
    return true;
  };

  const handleSendOtp = async () => {
    setErrorMessage(null);
    if (!validateIdentity()) {
      return;
    }

    setLoading(true);
    try {
      const res = await sendProviderOtpApi(identity.trim());
      if (res.success) {
        setStep('otp');
      } else {
        setErrorMessage(res.message || 'Failed to send OTP. Please check your credentials.');
      }
    } catch (e) {
      setErrorMessage('Network error communicating with authentication service.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setErrorMessage(null);
    if (otp.trim().length !== 6) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyProviderOtpApi(identity.trim(), otp.trim());
      if (res.success && res.user) {
        await storeProviderUser(res.user);
        onLoginSuccess(res.user);
        handleReset();
        onClose();
      } else {
        setErrorMessage(res.message || 'Invalid or expired OTP code.');
      }
    } catch (e) {
      setErrorMessage('Network error verifying code.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setIdentity('');
    setOtp('');
    setStep('identity');
    setErrorMessage(null);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        handleReset();
        onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={styles.backdrop}
          onPress={() => {
            handleReset();
            onClose();
          }}
        />

        <GlassCard
          theme={theme}
          intensity={40}
          style={[
            styles.authCard,
            {
              backgroundColor: theme === 'dark' ? 'rgba(18, 20, 24, 0.94)' : 'rgba(255, 255, 255, 0.96)',
              borderColor: activeTheme.cardBorder,
            },
          ]}
        >
          {/* Header Close Button */}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => {
              handleReset();
              onClose();
            }}
          >
            <MaterialCommunityIcons name="close" size={20} color={activeTheme.textSecondary} />
          </TouchableOpacity>

          {/* Logo & Portal Identity */}
          <View style={styles.headerArea}>
            <Image source={require('../../assets/logo.png')} style={styles.brandLogo} />
            <View style={styles.portalBadge}>
              <MaterialCommunityIcons name="shield-check" size={13} color="#0084FF" />
              <Text style={styles.portalBadgeText}>Service Provider Portal</Text>
            </View>
            <Text style={[styles.portalSubtitle, { color: activeTheme.textSecondary }]}>
              Secure access to your Service Provider dashboard.
            </Text>
          </View>

          {/* STEP 1: IDENTITY INPUT */}
          {step === 'identity' && (
            <View style={styles.formContainer}>
              <Text style={[styles.fieldLabel, { color: activeTheme.textSecondary }]}>
                {otpConfig.label}
              </Text>

              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: activeTheme.tableHeaderBg,
                    borderColor: errorMessage ? '#FF453A' : activeTheme.cardBorder,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={
                    otpConfig.mode === 'phone'
                      ? 'phone-outline'
                      : otpConfig.mode === 'email'
                      ? 'email-outline'
                      : 'account-outline'
                  }
                  size={18}
                  color={activeTheme.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.textInput, { color: activeTheme.textPrimary }]}
                  placeholder={otpConfig.placeholder}
                  placeholderTextColor={activeTheme.textSecondary}
                  value={identity}
                  onChangeText={(val) => {
                    setIdentity(val);
                    const clean = val.trim();
                    if (!clean) {
                      setErrorMessage(null);
                      return;
                    }
                    if (otpConfig.mode === 'email' || !otpConfig.phone_otp_enabled) {
                      const cleanPhone = clean.replace(/[\s\-+]/g, '');
                      // If user entered any digits or phone format:
                      if (/\d/.test(clean) || /^\d+$/.test(cleanPhone)) {
                        setErrorMessage('Phone number login is closed. Please enter your email.');
                      } else {
                        setErrorMessage(null);
                      }
                    } else if (otpConfig.mode === 'phone' || !otpConfig.email_otp_enabled) {
                      if (clean.includes('@')) {
                        setErrorMessage('Email login is closed. Please enter your phone number.');
                      } else {
                        setErrorMessage(null);
                      }
                    } else {
                      setErrorMessage(null);
                    }
                  }}
                  keyboardType={otpConfig.mode === 'phone' ? 'phone-pad' : 'email-address'}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Status / Error Text ONLY displayed when user enters an invalid number/input */}
              {errorMessage ? (
                <Text style={styles.fieldErrorText}>{errorMessage}</Text>
              ) : null}

              <TouchableOpacity
                onPress={handleSendOtp}
                disabled={loading}
                style={[styles.primaryBtn, { backgroundColor: '#0084FF' }]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>Send OTP</Text>
                    <MaterialCommunityIcons name="arrow-right" size={18} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: OTP VERIFICATION */}
          {step === 'otp' && (
            <View style={styles.formContainer}>
              <View style={styles.otpSentHeader}>
                <Text style={[styles.otpSubLabel, { color: activeTheme.textSecondary }]}>
                  Verification code sent to:{' '}
                  <Text style={{ fontWeight: '700', color: activeTheme.textPrimary }}>
                    {identity}
                  </Text>
                </Text>
                <TouchableOpacity onPress={() => setStep('identity')} style={styles.changeLink}>
                  <Text style={styles.changeLinkText}>Change</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { color: activeTheme.textSecondary }]}>
                ENTER 6-DIGIT OTP
              </Text>

              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: activeTheme.tableHeaderBg,
                    borderColor: errorMessage ? '#FF453A' : activeTheme.cardBorder,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="shield-key-outline"
                  size={18}
                  color={activeTheme.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.textInput, styles.otpTextInput, { color: activeTheme.textPrimary }]}
                  placeholder="------"
                  placeholderTextColor={activeTheme.textSecondary}
                  value={otp}
                  onChangeText={(val) => {
                    setOtp(val.replace(/[^0-9]/g, '').slice(0, 6));
                    if (errorMessage) setErrorMessage(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>

              {errorMessage && (
                <View style={styles.errorRow}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={14} color="#FF453A" />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleVerifyOtp}
                disabled={loading}
                style={[styles.primaryBtn, { backgroundColor: '#30D158' }]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.primaryBtnText}>Verify & Login</Text>
                    <MaterialCommunityIcons name="check-circle" size={18} color="#FFFFFF" />
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSendOtp} disabled={loading} style={styles.resendBtn}>
                <Text style={styles.resendBtnText}>Didn't receive code? Resend OTP</Text>
              </TouchableOpacity>
            </View>
          )}
        </GlassCard>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    ...(StyleSheet.absoluteFill as any),
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  authCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerArea: {
    alignItems: 'center',
    marginBottom: 18,
    width: '100%',
  },
  brandLogo: {
    width: 140,
    height: 36,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  portalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 132, 255, 0.12)',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  portalBadgeText: {
    color: '#0084FF',
    fontSize: 11,
    fontWeight: '800',
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  portalSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 280,
  },
  formContainer: {
    width: '100%',
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 8,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    height: '100%',
  },
  otpTextInput: {
    fontSize: 18,
    letterSpacing: 6,
    fontWeight: '800',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  errorText: {
    color: '#FF453A',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
    flex: 1,
  },
  fieldErrorText: {
    color: '#e74c3c',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
    marginTop: -2,
    paddingLeft: 4,
  },
  primaryBtn: {
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    marginRight: 6,
  },
  otpSentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  otpSubLabel: {
    fontSize: 11,
    flex: 1,
  },
  changeLink: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  changeLinkText: {
    color: '#0084FF',
    fontSize: 11,
    fontWeight: '700',
  },
  resendBtn: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  resendBtnText: {
    color: '#0084FF',
    fontSize: 11,
    fontWeight: '700',
  },
});
