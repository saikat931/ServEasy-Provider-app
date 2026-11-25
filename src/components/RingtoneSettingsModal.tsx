import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
  Platform,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import {
  loadRingtoneSettings,
  saveRingtoneSettings,
  saveCustomAudioFile,
  restoreDefaultRingtone,
  RingtoneSettings,
  DEFAULT_RINGTONE_SETTINGS,
} from '../services/RingtoneSettingsStorage';
import { RingtoneService } from '../services/RingtoneService';

function getDocumentPicker(): typeof import('expo-document-picker') | null {
  try {
    return require('expo-document-picker');
  } catch (err) {
    console.warn('[RingtoneSettingsModal] Native DocumentPicker module not found in binary build.');
    return null;
  }
}

interface RingtoneSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
}

export const RingtoneSettingsModal: React.FC<RingtoneSettingsModalProps> = ({
  visible,
  onClose,
  theme = 'dark',
}) => {
  const [settings, setSettings] = useState<RingtoneSettings>(DEFAULT_RINGTONE_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);
  const [isPicking, setIsPicking] = useState<boolean>(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const isDark = theme === 'dark';

  // Load current settings when opened
  useEffect(() => {
    if (visible) {
      loadSettings();
    } else {
      RingtoneService.stopPreview();
      setIsPlayingPreview(false);
      setPreviewError(null);
    }
  }, [visible]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await loadRingtoneSettings();
      setSettings(data);
    } catch (err) {
      console.warn('[RingtoneSettingsModal] Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDefault = async () => {
    RingtoneService.stopPreview();
    setIsPlayingPreview(false);
    const updated: RingtoneSettings = { ...settings, type: 'default' };
    setSettings(updated);
    await saveRingtoneSettings(updated);
  };

  const handleSelectCustom = async () => {
    RingtoneService.stopPreview();
    setIsPlayingPreview(false);
    if (!settings.customFileUri) {
      // Prompt user to pick a file
      handlePickCustomAudio();
    } else {
      const updated: RingtoneSettings = { ...settings, type: 'custom' };
      setSettings(updated);
      await saveRingtoneSettings(updated);
    }
  };

  const handlePickCustomAudio = async () => {
    RingtoneService.stopPreview();
    setIsPlayingPreview(false);
    setPreviewError(null);
    setIsPicking(true);

    try {
      const picker = getDocumentPicker();
      if (!picker || !picker.getDocumentAsync) {
        Alert.alert(
          'APK Update Required',
          'Importing custom audio from device storage requires the latest native APK build. Please install the updated APK from your dashboard.'
        );
        setIsPicking(false);
        return;
      }

      const result = await picker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const res = await saveCustomAudioFile(asset.uri, asset.name, asset.size);

        if (res.success && res.persistentUri) {
          const updated: RingtoneSettings = {
            ...settings,
            type: 'custom',
            customFileUri: res.persistentUri,
            customFileName: res.fileName || asset.name,
            customFileSize: asset.size ?? null,
          };
          setSettings(updated);

          // Auto-play a short preview to confirm
          RingtoneService.previewRingtone(res.persistentUri);
          setIsPlayingPreview(true);
        } else {
          Alert.alert('Unsupported Audio', res.error || 'Failed to import audio file.');
        }
      }
    } catch (err: any) {
      console.error('[RingtoneSettingsModal] DocumentPicker error:', err);
      Alert.alert('Error', 'Could not open device audio picker: ' + (err?.message || ''));
    } finally {
      setIsPicking(false);
    }
  };

  const handleTogglePreview = async () => {
    setPreviewError(null);
    if (isPlayingPreview) {
      RingtoneService.stopPreview();
      setIsPlayingPreview(false);
    } else {
      const success = await RingtoneService.previewRingtone(
        settings.type === 'custom' ? settings.customFileUri : null
      );
      if (success) {
        setIsPlayingPreview(true);
      } else {
        setPreviewError('Could not play audio preview.');
      }
    }
  };

  const handleRestoreDefault = () => {
    Alert.alert(
      'Restore Default Ringtone',
      'Are you sure you want to revert to the default ServEasy ringtone and clear your custom audio file?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            RingtoneService.stopPreview();
            setIsPlayingPreview(false);
            await restoreDefaultRingtone();
            await loadSettings();
          },
        },
      ]
    );
  };

  const handleToggleVibration = async (value: boolean) => {
    const updated: RingtoneSettings = { ...settings, vibrationEnabled: value };
    setSettings(updated);
    await saveRingtoneSettings(updated);
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) {
      return `(${(bytes / 1024).toFixed(1)} KB)`;
    }
    return `(${(bytes / (1024 * 1024)).toFixed(1)} MB)`;
  };

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={() => {
        RingtoneService.stopPreview();
        onClose();
      }}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <View
          style={[
            styles.modalContainer,
            {
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleBox}>
              <View style={styles.iconBadge}>
                <MaterialCommunityIcons name="bell-ring-outline" size={22} color="#0084FF" />
              </View>
              <View>
                <Text style={[styles.title, { color: isDark ? '#FFFFFF' : '#111827' }]}>
                  Live Booking Ringtone
                </Text>
                <Text style={[styles.subtitle, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                  Settings • Audio & Notification Alerts
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => {
                RingtoneService.stopPreview();
                onClose();
              }}
              style={[
                styles.closeBtn,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' },
              ]}
            >
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={isDark ? '#FFFFFF' : '#374151'}
              />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#0084FF" />
              <Text style={[styles.loadingText, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                Loading ringtone preferences...
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* CURRENT SELECTION CARD */}
              <View
                style={[
                  styles.currentCard,
                  {
                    backgroundColor: isDark ? 'rgba(0, 132, 255, 0.12)' : '#EFF6FF',
                    borderColor: isDark ? 'rgba(0, 132, 255, 0.3)' : '#BFDBFE',
                  },
                ]}
              >
                <View style={styles.currentCardHeader}>
                  <Text style={styles.currentLabel}>ACTIVE LIVE RINGTONE</Text>
                  <View style={styles.activePill}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activePillText}>READY</Text>
                  </View>
                </View>

                <Text style={[styles.currentName, { color: isDark ? '#FFFFFF' : '#1E3A8A' }]}>
                  {settings.type === 'default'
                    ? 'ServEasy Default Live Ringtone'
                    : settings.customFileName || 'Custom Device Audio'}
                </Text>
                <Text style={[styles.currentSub, { color: isDark ? '#93C5FD' : '#3B82F6' }]}>
                  {settings.type === 'default'
                    ? '44.1kHz Original Stereo Audio • Continuous Loop'
                    : `Imported Device Audio ${formatFileSize(settings.customFileSize)}`}
                </Text>

                {/* Preview / Stop Button */}
                <TouchableOpacity
                  style={[
                    styles.previewBtn,
                    {
                      backgroundColor: isPlayingPreview ? '#FF453A' : '#0084FF',
                    },
                  ]}
                  onPress={handleTogglePreview}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name={isPlayingPreview ? 'stop-circle' : 'play-circle'}
                    size={22}
                    color="#FFFFFF"
                  />
                  <Text style={styles.previewBtnText}>
                    {isPlayingPreview ? 'STOP PREVIEW' : 'PREVIEW RINGTONE'}
                  </Text>
                </TouchableOpacity>

                {previewError && (
                  <Text style={styles.errorText}>⚠️ {previewError}</Text>
                )}
              </View>

              {/* SECTION: SELECT AUDIO SOURCE */}
              <Text
                style={[
                  styles.sectionHeader,
                  { color: isDark ? '#9CA3AF' : '#6B7280' },
                ]}
              >
                AVAILABLE OPTIONS
              </Text>

              {/* Option 1: ServEasy Default */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
                    borderColor:
                      settings.type === 'default'
                        ? '#0084FF'
                        : isDark
                        ? 'rgba(255,255,255,0.08)'
                        : '#E5E7EB',
                  },
                  settings.type === 'default' && styles.optionCardSelected,
                ]}
                onPress={handleSelectDefault}
                activeOpacity={0.7}
              >
                <View style={styles.optionLeft}>
                  <View
                    style={[
                      styles.radioCircle,
                      settings.type === 'default' && styles.radioCircleSelected,
                    ]}
                  >
                    {settings.type === 'default' && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.optionTextBox}>
                    <Text
                      style={[
                        styles.optionTitle,
                        { color: isDark ? '#FFFFFF' : '#111827' },
                      ]}
                    >
                      ServEasy Default
                    </Text>
                    <Text
                      style={[
                        styles.optionDescription,
                        { color: isDark ? '#9CA3AF' : '#6B7280' },
                      ]}
                    >
                      Classic 90s telephone ringtone for live booking alerts
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons
                  name="shield-check"
                  size={20}
                  color={settings.type === 'default' ? '#0084FF' : '#9CA3AF'}
                />
              </TouchableOpacity>

              {/* Option 2: Custom Device Music */}
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
                    borderColor:
                      settings.type === 'custom'
                        ? '#0084FF'
                        : isDark
                        ? 'rgba(255,255,255,0.08)'
                        : '#E5E7EB',
                  },
                  settings.type === 'custom' && styles.optionCardSelected,
                ]}
                onPress={handleSelectCustom}
                activeOpacity={0.7}
              >
                <View style={styles.optionLeft}>
                  <View
                    style={[
                      styles.radioCircle,
                      settings.type === 'custom' && styles.radioCircleSelected,
                    ]}
                  >
                    {settings.type === 'custom' && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.optionTextBox}>
                    <Text
                      style={[
                        styles.optionTitle,
                        { color: isDark ? '#FFFFFF' : '#111827' },
                      ]}
                    >
                      Custom Device Music
                    </Text>
                    <Text
                      style={[
                        styles.optionDescription,
                        { color: isDark ? '#9CA3AF' : '#6B7280' },
                      ]}
                    >
                      {settings.customFileName
                        ? settings.customFileName
                        : 'Choose an MP3 / M4A / WAV file from device'}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons
                  name="folder-music-outline"
                  size={20}
                  color={settings.type === 'custom' ? '#0084FF' : '#9CA3AF'}
                />
              </TouchableOpacity>

              {/* File Picker Button */}
              <TouchableOpacity
                style={[
                  styles.filePickerBtn,
                  {
                    borderColor: isDark ? 'rgba(0, 132, 255, 0.4)' : '#93C5FD',
                    backgroundColor: isDark ? 'rgba(0, 132, 255, 0.08)' : '#EFF6FF',
                  },
                ]}
                onPress={handlePickCustomAudio}
                disabled={isPicking}
                activeOpacity={0.8}
              >
                {isPicking ? (
                  <ActivityIndicator size="small" color="#0084FF" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="cloud-upload-outline"
                      size={20}
                      color="#0084FF"
                    />
                    <Text style={styles.filePickerBtnText}>
                      {settings.customFileName
                        ? 'Select Another Audio File'
                        : 'Choose Music From Device'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              {/* SECTION: ADDITIONAL SETTINGS */}
              <Text
                style={[
                  styles.sectionHeader,
                  { color: isDark ? '#9CA3AF' : '#6B7280', marginTop: 22 },
                ]}
              >
                ALERT BEHAVIOR
              </Text>

              {/* Vibration Toggle */}
              <View
                style={[
                  styles.settingRow,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
                    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
                  },
                ]}
              >
                <View style={styles.settingLeft}>
                  <MaterialCommunityIcons name="vibrate" size={22} color="#0084FF" />
                  <View style={styles.settingTextBox}>
                    <Text
                      style={[
                        styles.settingTitle,
                        { color: isDark ? '#FFFFFF' : '#111827' },
                      ]}
                    >
                      Vibration Alert
                    </Text>
                    <Text
                      style={[
                        styles.settingSubtitle,
                        { color: isDark ? '#9CA3AF' : '#6B7280' },
                      ]}
                    >
                      Vibrate phone during incoming live bookings
                    </Text>
                  </View>
                </View>
                <Switch
                  value={settings.vibrationEnabled}
                  onValueChange={handleToggleVibration}
                  trackColor={{ false: '#767577', true: '#0084FF' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Restore Default Button */}
              {settings.type === 'custom' && (
                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={handleRestoreDefault}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="backup-restore" size={18} color="#FF453A" />
                  <Text style={styles.restoreBtnText}>Restore Default ServEasy Ringtone</Text>
                </TouchableOpacity>
              )}

              {/* Notice */}
              <View
                style={[
                  styles.noticeBox,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F3F4F6',
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name="information-outline"
                  size={16}
                  color={isDark ? '#9CA3AF' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.noticeText,
                    { color: isDark ? '#9CA3AF' : '#6B7280' },
                  ]}
                >
                  Selected audio is saved locally to your device and never uploaded to any remote server. Ringtone plays continuously until the request is accepted, rejected, or expires.
                </Text>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  headerTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 132, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingBox: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  currentCard: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 20,
  },
  currentCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  currentLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0084FF',
    letterSpacing: 0.5,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
  },
  currentName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  currentSub: {
    fontSize: 12,
    marginBottom: 14,
  },
  previewBtn: {
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  previewBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  errorText: {
    fontSize: 12,
    color: '#FF453A',
    marginTop: 8,
    textAlign: 'center',
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  optionCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionCardSelected: {
    borderColor: '#0084FF',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: '#0084FF',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0084FF',
  },
  optionTextBox: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 12,
  },
  filePickerBtn: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 12,
  },
  filePickerBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0084FF',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 10,
  },
  settingTextBox: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  settingSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  restoreBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 14,
  },
  restoreBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF453A',
  },
  noticeBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    gap: 8,
    alignItems: 'flex-start',
  },
  noticeText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
});
