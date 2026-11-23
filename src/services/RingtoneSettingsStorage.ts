import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

export type RingtoneType = 'default' | 'custom';

export interface RingtoneSettings {
  type: RingtoneType;
  customFileUri: string | null;
  customFileName: string | null;
  customFileSize: number | null;
  vibrationEnabled: boolean;
  volume: number; // 0.0 to 1.0
}

const STORAGE_KEY = '@serveasy_provider_ringtone_settings_v1';

export const DEFAULT_RINGTONE_SETTINGS: RingtoneSettings = {
  type: 'default',
  customFileUri: null,
  customFileName: null,
  customFileSize: null,
  vibrationEnabled: true,
  volume: 1.0,
};

/**
 * Load saved ringtone settings from persistent device storage.
 */
export async function loadRingtoneSettings(): Promise<RingtoneSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RINGTONE_SETTINGS };

    const parsed = JSON.parse(raw);
    return {
      type: parsed.type === 'custom' ? 'custom' : 'default',
      customFileUri: parsed.customFileUri || null,
      customFileName: parsed.customFileName || null,
      customFileSize: typeof parsed.customFileSize === 'number' ? parsed.customFileSize : null,
      vibrationEnabled: parsed.vibrationEnabled !== false,
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 1.0,
    };
  } catch (err) {
    console.warn('[RingtoneSettingsStorage] Failed to read settings, falling back to default:', err);
    return { ...DEFAULT_RINGTONE_SETTINGS };
  }
}

/**
 * Save ringtone settings to persistent storage.
 */
export async function saveRingtoneSettings(settings: RingtoneSettings): Promise<boolean> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (err) {
    console.error('[RingtoneSettingsStorage] Failed to save settings:', err);
    return false;
  }
}

/**
 * Validate and safely copy a picked audio file into the app's persistent internal storage.
 * On Android SAF / DocumentPicker, content:// URIs can expire or become inaccessible on reboot.
 * Copying to FileSystem.documentDirectory guarantees permanent, sandboxed local access.
 */
export async function saveCustomAudioFile(
  sourceUri: string,
  originalName: string,
  fileSize?: number
): Promise<{ success: boolean; persistentUri?: string; fileName?: string; error?: string }> {
  try {
    if (!FileSystem.documentDirectory) {
      return { success: false, error: 'Device document directory not accessible.' };
    }

    // Determine extension
    const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';

    // Verify valid audio extensions
    const supportedExts = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'];
    if (!supportedExts.includes(ext)) {
      return {
        success: false,
        error: `Unsupported audio format .${ext}. Supported formats: MP3, WAV, M4A, AAC, OGG.`,
      };
    }

    // Limit maximum file size to 25MB to avoid memory pressure during playback
    if (fileSize && fileSize > 25 * 1024 * 1024) {
      return {
        success: false,
        error: 'The selected audio file exceeds 25 MB. Please choose a smaller track.',
      };
    }

    const destinationUri = `${FileSystem.documentDirectory}serveasy_custom_ringtone.${ext}`;

    // Clean up any previously stored custom ringtone file
    try {
      const existing = await FileSystem.getInfoAsync(destinationUri);
      if (existing.exists) {
        await FileSystem.deleteAsync(destinationUri, { idempotent: true });
      }
    } catch (_) {}

    // Copy to persistent sandboxed directory
    await FileSystem.copyAsync({
      from: sourceUri,
      to: destinationUri,
    });

    // Verify the copied file exists and has size > 0
    const info = await FileSystem.getInfoAsync(destinationUri);
    if (!info.exists || (info.size && info.size === 0)) {
      return { success: false, error: 'Could not write custom audio file to local storage.' };
    }

    // Update settings in AsyncStorage
    const current = await loadRingtoneSettings();
    const updated: RingtoneSettings = {
      ...current,
      type: 'custom',
      customFileUri: destinationUri,
      customFileName: originalName,
      customFileSize: info.size ?? fileSize ?? null,
    };
    await saveRingtoneSettings(updated);

    return {
      success: true,
      persistentUri: destinationUri,
      fileName: originalName,
    };
  } catch (err: any) {
    console.error('[RingtoneSettingsStorage] Error copying custom audio file:', err);
    return { success: false, error: err?.message || 'Failed to save audio file.' };
  }
}

/**
 * Revert to the default ServEasy ringtone and clean up any stored custom audio file.
 */
export async function restoreDefaultRingtone(): Promise<boolean> {
  try {
    const current = await loadRingtoneSettings();
    if (current.customFileUri) {
      try {
        await FileSystem.deleteAsync(current.customFileUri, { idempotent: true });
      } catch (_) {}
    }

    const updated: RingtoneSettings = {
      ...current,
      type: 'default',
      customFileUri: null,
      customFileName: null,
      customFileSize: null,
    };
    return await saveRingtoneSettings(updated);
  } catch (err) {
    console.error('[RingtoneSettingsStorage] Failed to restore default ringtone:', err);
    return false;
  }
}
