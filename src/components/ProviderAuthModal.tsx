import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  Modal,
  Image,
  ActivityIndicator,
  Platform,
  Keyboard,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { GlassCard } from './GlassCard';
import { ServerConnectionModal } from './ServerConnectionModal';
import {
  sendProviderOtpApi,
  verifyProviderOtpApi,
  fetchOtpConfigApi,
  storeProviderUser,
  ProviderUser,
  OtpConfig,
} from '../services/api';

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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [serverErrorVisible, setServerErrorVisible] = useState(false);
  const [serverErrorMessage, setServerErrorMessage] = useState(
    'Unable to connect to the authentication server. Please check your internet connection or mobile data and try again.'
  );

  const emailInputRef = useRef<any>(null);
  const otpInputRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [otpConfig, setOtpConfig] = useState<OtpConfig>({
    email_otp_enabled: true,
    phone_otp_enabled: false,
    mode: 'email',
    label: 'EMAIL ADDRESS',
    placeholder: 'Please enter your email',
    validation_message: 'Phone number login is closed. Please enter your email.',
    input_type: 'email',
  });

  const loadOtpConfig = async () => {
    try {
      const cfg = await fetchOtpConfigApi();
      if (cfg) {
        setOtpConfig({
          ...cfg,
          label: (cfg.label || 'Email or Phone Number').toUpperCase(),
          placeholder: cfg.placeholder || 'Please enter your email or phone number',
        });
      }
    } catch (e) {
      console.log('[ProviderAuthModal] loadOtpConfig error:', e);
    }
  };

  useEffect(() => {
    if (visible) {
      setLoading(false);
      setErrorMessage(null);
      setServerErrorVisible(false);
      loadOtpConfig();
    } else {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setLoading(false);
      setServerErrorVisible(false);
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const validateIdentity = () => {
    const val = identity.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^[0-9]{10}$/;
    const cleanPhone = val.replace(/[\s\-+]/g, '');

    if (otpConfig.mode === 'email' || !otpConfig.phone_otp_enabled) {
      if (/^\d+$/.test(cleanPhone) || (!val.includes('@') && cleanPhone.length > 0)) {
        setErrorMessage('Phone number login is closed. Please enter your email.');
        return false;
      }
      if (!emailPattern.test(val)) {
        setErrorMessage('Please enter a valid email address.');
        return false;
      }
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
      return true;
    }

    if (!emailPattern.test(val) && !phonePattern.test(cleanPhone)) {
      setErrorMessage('Please enter a valid email or 10-digit mobile number.');
      return false;
    }
    return true;
  };

  const handleSendOtp = () => {
    setErrorMessage(null);
    setServerErrorVisible(false);
    if (!validateIdentity()) {
      return;
    }

    // Cancel any previous in-flight request
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const targetIdentity = identity.trim();

    // 1-MILLISECOND INSTANT UI TRANSITION TO STEP 2 (Matching Customer App)
    setStep('otp');
    setLoading(false);

    // Auto-focus the 6-digit OTP box smoothly
    setTimeout(() => {
      otpInputRef.current?.focus();
    }, 80);

    // Concurrently dispatch OTP email request in background
    sendProviderOtpApi(targetIdentity, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (!res.success) {
          if (
            res.message === 'Failed to connect with server' ||
            res.message?.toLowerCase().includes('connect') ||
            res.message?.toLowerCase().includes('network')
          ) {
            Keyboard.dismiss();
            setStep('identity');
            setServerErrorMessage(res.message || 'Failed to connect with server');
            setServerErrorVisible(true);
          } else {
            setErrorMessage(res.message || 'Failed to send OTP. Please check your email.');
          }
        }
      })
      .catch((e: any) => {
        if (controller.signal.aborted) return;
        Keyboard.dismiss();
        setStep('identity');
        setServerErrorMessage('Failed to connect with server');
        setServerErrorVisible(true);
      });
  };

  const handleResendOtp = async () => {
    setErrorMessage(null);
    setServerErrorVisible(false);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await sendProviderOtpApi(identity.trim(), controller.signal);
      if (controller.signal.aborted) return;
      if (!res.success) {
        if (
          res.message === 'Failed to connect with server' ||
          res.message?.toLowerCase().includes('connect') ||
          res.message?.toLowerCase().includes('network')
        ) {
          Keyboard.dismiss();
          setServerErrorMessage(res.message || 'Failed to connect with server');
          setServerErrorVisible(true);
        } else {
          setErrorMessage(res.message || 'Failed to resend verification code.');
        }
      }
    } catch (e: any) {
      if (controller.signal.aborted) return;
      Keyboard.dismiss();
      setServerErrorMessage('Failed to connect with server');
      setServerErrorVisible(true);
    }
  };

  const handleVerifyOtp = async () => {
    setErrorMessage(null);
    setServerErrorVisible(false);
    if (otp.trim().length !== 6) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await verifyProviderOtpApi(identity.trim(), otp.trim(), controller.signal);
      if (controller.signal.aborted) return;
      if (res.success && res.user) {
        await storeProviderUser(res.user);
        onLoginSuccess(res.user);
        handleReset();
        onClose();
      } else {
        if (
          res.message === 'Failed to connect with server' ||
          res.message?.toLowerCase().includes('connect') ||
          res.message?.toLowerCase().includes('network')
        ) {
          Keyboard.dismiss();
          setServerErrorMessage(res.message || 'Failed to connect with server');
          setServerErrorVisible(true);
        } else {
          setErrorMessage(res.message || 'Invalid verification code.');
        }
      }
    } catch (e: any) {
      if (controller.signal.aborted) return;
      Keyboard.dismiss();
      setServerErrorMessage('Failed to connect with server');
      setServerErrorVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setLoading(false);
    setIdentity('');
    setOtp('');
    setStep('identity');
    setErrorMessage(null);
    setServerErrorVisible(false);
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      statusBarTranslucent={true}
      onRequestClose={() => {
        if (keyboardVisible) {
          Keyboard.dismiss();
        } else {
          handleReset();
          onClose();
        }
      }}
    >
      <View style={styles.modalRoot}>
        {/* Full-screen Dark Backdrop Layer:
            - If keyboard is open: tapping dark background ONLY dismisses keyboard. Modal stays open!
            - If keyboard is closed: tapping dark background closes modal. */}
        <TouchableWithoutFeedback
          onPress={() => {
            if (keyboardVisible) {
              Keyboard.dismiss();
            } else {
              handleReset();
              onClose();
            }
          }}
        >
          <View style={styles.backdropOverlay} />
        </TouchableWithoutFeedback>

        {/* KeyboardAvoidingView handles window offset and keyboard height smoothly */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          style={styles.keyboardAvoidingContainer}
          pointerEvents="box-none"
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContentContainer,
              keyboardVisible ? styles.scrollContentWithKeyboard : styles.scrollContentCentered,
              keyboardVisible && { paddingBottom: 30 },
            ]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
            pointerEvents="box-none"
          >
            {/* Modal Card Touch Container:
                onStartShouldSetResponder={() => true} ensures touches INSIDE the card NEVER pass to backdrop */}
            <View
              style={[styles.modalCardWrapper, keyboardVisible && styles.modalCardWrapperCompact]}
              onStartShouldSetResponder={() => true}
              onTouchEnd={(e) => {
                if (e && e.stopPropagation) {
                  e.stopPropagation();
                }
              }}
            >
              <GlassCard
                theme={theme}
                style={[styles.modalCard, keyboardVisible && styles.modalCardCompact]}
                intensity={activeTheme.glassIntensity ? activeTheme.glassIntensity + 15 : 40}
              >
                {/* Close button */}
                <TouchableOpacity
                  style={[
                    styles.closeBtn,
                    keyboardVisible && styles.closeBtnCompact,
                    { backgroundColor: activeTheme.pillInactiveBg || 'rgba(255, 255, 255, 0.08)' },
                  ]}
                  onPress={() => {
                    handleReset();
                    onClose();
                  }}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={keyboardVisible ? 16 : 18}
                    color={activeTheme.textPrimary}
                  />
                </TouchableOpacity>

                {/* Logo & Headline */}
                <View style={[styles.headerBox, keyboardVisible && styles.headerBoxCompact]}>
                  <Image
                    source={require('../../assets/logo.png')}
                    style={[styles.logoImage, keyboardVisible && styles.logoImageCompact]}
                  />
                  <View style={styles.portalBadge}>
                    <MaterialCommunityIcons name="shield-check" size={13} color="#0084FF" />
                    <Text style={styles.portalBadgeText}>SERVICE PROVIDER</Text>
                  </View>
                  <Text
                    style={[
                      styles.title,
                      keyboardVisible && styles.titleCompact,
                      { color: activeTheme.textPrimary },
                    ]}
                  >
                    {step === 'identity' ? 'Sign In / Register' : 'Verify Security Code'}
                  </Text>
                  {(!keyboardVisible || step === 'otp') && (
                    <Text
                      style={[
                        styles.subtitle,
                        keyboardVisible && styles.subtitleCompact,
                        { color: activeTheme.textSecondary },
                      ]}
                    >
                      {step === 'identity'
                        ? 'Enter your provider phone number or email to access your dashboard.'
                        : `We sent a 6-digit verification code to ${identity}`}
                    </Text>
                  )}
                </View>

                {/* Instant Verification Code Sent Banner */}
                {step === 'otp' && (
                  <View style={[styles.successBanner, keyboardVisible && styles.successBannerCompact]}>
                    <MaterialCommunityIcons
                      name="email-check-outline"
                      size={keyboardVisible ? 16 : 18}
                      color="#30D158"
                      style={{ marginRight: 8 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.successBannerTitle}>Verification code sent!</Text>
                      <Text
                        style={[styles.successBannerSubtitle, { color: activeTheme.textSecondary }]}
                        numberOfLines={1}
                      >
                        Check your inbox for {identity.trim()}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Error Banner (shown during OTP step) */}
                {errorMessage && step === 'otp' && (
                  <View style={styles.errorBox}>
                    <MaterialCommunityIcons
                      name="alert-circle-outline"
                      size={15}
                      color="#FF3B30"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.errorText}>{errorMessage}</Text>
                  </View>
                )}

                {step === 'identity' ? (
                  /* STEP 1: Phone / Email */
                  <View style={styles.formContent}>
                    <Text style={[styles.inputLabel, { color: activeTheme.textSecondary }]}>
                      {otpConfig.label}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => emailInputRef.current?.focus()}
                      style={[
                        styles.inputContainer,
                        keyboardVisible && styles.inputContainerCompact,
                        {
                          backgroundColor: activeTheme.inputBg || 'rgba(255, 255, 255, 0.06)',
                          borderColor: errorMessage ? '#e74c3c' : activeTheme.cardBorder,
                          marginBottom: errorMessage ? 6 : keyboardVisible ? 10 : 14,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          otpConfig.mode === 'phone'
                            ? 'phone'
                            : otpConfig.mode === 'email'
                            ? 'email-outline'
                            : 'account-circle-outline'
                        }
                        size={keyboardVisible ? 18 : 20}
                        color={errorMessage ? '#e74c3c' : activeTheme.iconColor || '#0084FF'}
                        style={{ marginRight: 8 }}
                      />
                      <TextInput
                        ref={emailInputRef}
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
                            if (/^\d+$/.test(cleanPhone)) {
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
                        keyboardType={
                          otpConfig.mode === 'phone'
                            ? 'phone-pad'
                            : otpConfig.mode === 'email'
                            ? 'email-address'
                            : 'default'
                        }
                        autoCapitalize="none"
                      />
                    </TouchableOpacity>

                    {/* Status / Error Text ONLY displayed when user enters an invalid number/input */}
                    {errorMessage ? (
                      <Text style={styles.fieldErrorText}>{errorMessage}</Text>
                    ) : null}

                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        keyboardVisible && styles.actionBtnCompact,
                        { backgroundColor: '#0084FF' },
                        loading && { opacity: 0.7 },
                      ]}
                      onPress={handleSendOtp}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Text style={styles.actionBtnText}>SEND OTP CODE</Text>
                          <MaterialCommunityIcons
                            name="arrow-right"
                            size={16}
                            color="#FFFFFF"
                            style={{ marginLeft: 6 }}
                          />
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* STEP 2: 6-Digit OTP */
                  <View style={styles.formContent}>
                    <Text style={[styles.inputLabel, { color: activeTheme.textSecondary }]}>
                      ENTER 6-DIGIT VERIFICATION CODE
                    </Text>
                    <TouchableOpacity
                      activeOpacity={1}
                      onPress={() => otpInputRef.current?.focus()}
                      style={[
                        styles.inputContainer,
                        keyboardVisible && styles.inputContainerCompact,
                        {
                          backgroundColor: activeTheme.inputBg || 'rgba(255, 255, 255, 0.06)',
                          borderColor: activeTheme.cardBorder,
                          marginBottom: keyboardVisible ? 10 : 14,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="shield-key-outline"
                        size={keyboardVisible ? 18 : 20}
                        color={activeTheme.iconColor || '#0084FF'}
                        style={{ marginRight: 8 }}
                      />
                      <TextInput
                        ref={otpInputRef}
                        style={[
                          styles.textInput,
                          { color: activeTheme.textPrimary, letterSpacing: 4, fontWeight: '800' },
                        ]}
                        placeholder="000000"
                        placeholderTextColor={activeTheme.textSecondary}
                        value={otp}
                        onChangeText={setOtp}
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        keyboardVisible && styles.actionBtnCompact,
                        { backgroundColor: '#30D158' },
                        loading && { opacity: 0.7 },
                      ]}
                      onPress={handleVerifyOtp}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <Text style={styles.actionBtnText}>VERIFY & LOGIN</Text>
                          <MaterialCommunityIcons
                            name="check-circle-outline"
                            size={16}
                            color="#FFFFFF"
                            style={{ marginLeft: 6 }}
                          />
                        </>
                      )}
                    </TouchableOpacity>

                    <View style={[styles.otpFooterRow, keyboardVisible && { marginTop: 8 }]}>
                      <TouchableOpacity
                        onPress={() => {
                          setErrorMessage(null);
                          setStep('identity');
                        }}
                      >
                        <Text style={[styles.changeIdentityText, { color: activeTheme.textSecondary }]}>
                          Change Phone / Email
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity onPress={handleResendOtp}>
                        <Text style={[styles.resendText, { color: '#0084FF' }]}>
                          Resend Code
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {identity.includes('@') && !keyboardVisible && (
                      <View style={styles.spamTipRow}>
                        <MaterialCommunityIcons
                          name="information-outline"
                          size={13}
                          color={activeTheme.textSecondary}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.spamTipText, { color: activeTheme.textSecondary }]}>
                          Can't find the email? Check your Spam or Promotions folder.
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </GlassCard>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Full-Screen Server Connection Error Overlay (Matching Customer App) */}
        <ServerConnectionModal
          visible={serverErrorVisible}
          onClose={() => setServerErrorVisible(false)}
          onRetry={() => {
            setServerErrorVisible(false);
            if (step === 'identity') {
              handleSendOtp();
            } else {
              handleResendOtp();
            }
          }}
          theme={theme}
          activeTheme={activeTheme}
          title="Unable to Connect"
          message={
            serverErrorMessage && serverErrorMessage !== 'Failed to connect with server'
              ? serverErrorMessage
              : "We couldn't reach the ServEasy server. Please verify your mobile data or Wi-Fi and try again."
          }
          asOverlay={true}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    position: 'relative',
  },
  backdropOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  keyboardAvoidingContainer: {
    flex: 1,
    width: '100%',
  },
  scrollContentContainer: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  scrollContentCentered: {
    justifyContent: 'center',
  },
  scrollContentWithKeyboard: {
    justifyContent: 'flex-end',
  },
  modalCardWrapper: {
    width: '100%',
    maxWidth: 380,
  },
  modalCardWrapperCompact: {
    maxWidth: 380,
  },
  modalCard: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
    position: 'relative',
  },
  modalCardCompact: {
    padding: 16,
    paddingTop: 14,
    borderRadius: 18,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  closeBtnCompact: {
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  headerBox: {
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 4,
  },
  headerBoxCompact: {
    marginBottom: 8,
    marginTop: 0,
  },
  logoImage: {
    width: 110,
    height: 32,
    resizeMode: 'contain',
    marginBottom: 6,
  },
  logoImageCompact: {
    width: 85,
    height: 24,
    marginBottom: 4,
  },
  portalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 132, 255, 0.12)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 6,
    gap: 4,
  },
  portalBadgeText: {
    color: '#0084FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 15,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  subtitleCompact: {
    fontSize: 11,
    lineHeight: 14,
    paddingHorizontal: 6,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(48, 209, 88, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.35)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  successBannerCompact: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  successBannerTitle: {
    color: '#30D158',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  successBannerSubtitle: {
    fontSize: 11,
    marginTop: 1,
    fontWeight: '500',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    borderRadius: 10,
    padding: 9,
    marginBottom: 12,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  formContent: {
    width: '100%',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 14,
  },
  inputContainerCompact: {
    height: 44,
    marginBottom: 10,
    paddingHorizontal: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
    padding: 0,
  },
  fieldErrorText: {
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 10,
    paddingLeft: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
  },
  actionBtnCompact: {
    height: 44,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  otpFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  changeIdentityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  resendText: {
    fontSize: 12,
    fontWeight: '700',
  },
  spamTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingHorizontal: 6,
  },
  spamTipText: {
    fontSize: 11,
    lineHeight: 15,
  },
});
