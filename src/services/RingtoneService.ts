import { Vibration, Platform } from 'react-native';
import { loadRingtoneSettings, RingtoneSettings } from './RingtoneSettingsStorage';

// Bundled copyright-safe default ringtone asset
const DEFAULT_RINGTONE_ASSET = require('../../assets/audio/serveasy_booking_ringtone.wav');

function getExpoAudio(): typeof import('expo-audio') | null {
  try {
    return require('expo-audio');
  } catch (err) {
    console.warn('[RingtoneService] Native ExpoAudio module not found in binary build.');
    return null;
  }
}

function getFileSystem(): typeof import('expo-file-system/legacy') | null {
  try {
    return require('expo-file-system/legacy');
  } catch (err) {
    return null;
  }
}

class RingtoneServiceManager {
  private player: any = null;
  private previewPlayer: any = null;
  private activeBookingId: number | string | null = null;
  private isRingingNow: boolean = false;
  private isPreviewingNow: boolean = false;
  private isVibrating: boolean = false;
  private isAudioModeConfigured: boolean = false;

  /**
   * Configure global audio mode once to allow playback in silent mode,
   * background audio continuation, and non-blocking ducking.
   */
  private async ensureAudioMode(): Promise<void> {
    if (this.isAudioModeConfigured) return;
    const AudioModule = getExpoAudio();
    if (!AudioModule || !AudioModule.setAudioModeAsync) return;

    try {
      await AudioModule.setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'mixWithOthers',
      });
      this.isAudioModeConfigured = true;
    } catch (err) {
      console.warn('[RingtoneService] Could not configure audio mode:', err);
    }
  }

  /**
   * Determine the audio source based on user settings and file availability.
   */
  private async resolveAudioSource(settings: RingtoneSettings): Promise<any> {
    if (settings.type === 'custom' && settings.customFileUri) {
      const fs = getFileSystem();
      if (fs) {
        try {
          const info = await fs.getInfoAsync(settings.customFileUri);
          if (info.exists) {
            return { uri: settings.customFileUri };
          }
          console.warn('[RingtoneService] Custom audio file missing, reverting to default ringtone.');
        } catch (e) {
          console.warn('[RingtoneService] Error inspecting custom audio file:', e);
        }
      }
    }
    // Default asset
    return DEFAULT_RINGTONE_ASSET;
  }

  /**
   * Start ringing for an incoming booking request.
   * Looping continues until accept, reject, expire, cancel, or logout occurs.
   *
   * @param bookingId Unique ID of the incoming booking
   */
  public async startRinging(bookingId: number | string): Promise<boolean> {
    // Prevent duplicate audio players for the same incoming booking event
    if (this.isRingingNow && this.activeBookingId === bookingId) {
      return true;
    }

    try {
      this.stopPreview();
      this.stopRinging();

      const settings = await loadRingtoneSettings();
      this.activeBookingId = bookingId;
      this.isRingingNow = true;

      // Always start repeating vibration alert
      if (settings.vibrationEnabled) {
        try {
          // Vibration pattern: wait 0ms, vibrate 800ms, wait 400ms, vibrate 800ms, wait 600ms
          Vibration.vibrate([0, 800, 400, 800, 600], true);
          this.isVibrating = true;
        } catch (vErr) {
          console.warn('[RingtoneService] Vibration trigger failed:', vErr);
        }
      }

      // Try playing audio if native module is present in the binary
      const AudioModule = getExpoAudio();
      if (AudioModule && AudioModule.createAudioPlayer) {
        await this.ensureAudioMode();
        const source = await this.resolveAudioSource(settings);
        const player = AudioModule.createAudioPlayer(source);
        player.loop = true;
        player.volume = settings.volume ?? 1.0;
        player.play();
        this.player = player;
      } else {
        console.log('[RingtoneService] Running in vibration-only mode until native APK is updated.');
      }

      console.log(`[RingtoneService] Started ringing alert for booking #${bookingId}`);
      return true;
    } catch (err) {
      console.error('[RingtoneService] Failed to start ringtone:', err);
      return false;
    }
  }

  /**
   * Stop ringtone immediately and release all audio/vibration resources.
   */
  public stopRinging(): void {
    if (this.player) {
      try {
        this.player.pause();
        this.player.release();
      } catch (err) {
        console.warn('[RingtoneService] Error releasing ringtone player:', err);
      }
      this.player = null;
    }

    if (this.isVibrating) {
      try {
        Vibration.cancel();
      } catch (_) {}
      this.isVibrating = false;
    }

    if (this.isRingingNow) {
      console.log(`[RingtoneService] Stopped ringtone for booking #${this.activeBookingId}`);
    }

    this.activeBookingId = null;
    this.isRingingNow = false;
  }

  /**
   * Preview a ringtone in Settings (either default or custom file).
   */
  public async previewRingtone(customUri?: string | null): Promise<boolean> {
    const AudioModule = getExpoAudio();
    if (!AudioModule || !AudioModule.createAudioPlayer) {
      return false;
    }

    try {
      await this.ensureAudioMode();
      this.stopRinging();
      this.stopPreview();

      let source: any = DEFAULT_RINGTONE_ASSET;

      if (customUri) {
        const fs = getFileSystem();
        if (fs) {
          const info = await fs.getInfoAsync(customUri);
          if (info.exists) {
            source = { uri: customUri };
          }
        }
      } else {
        const settings = await loadRingtoneSettings();
        source = await this.resolveAudioSource(settings);
      }

      const player = AudioModule.createAudioPlayer(source);
      player.loop = true;
      player.volume = 1.0;
      player.play();

      this.previewPlayer = player;
      this.isPreviewingNow = true;
      return true;
    } catch (err) {
      console.error('[RingtoneService] Failed to preview audio:', err);
      this.stopPreview();
      return false;
    }
  }

  /**
   * Stop any active ringtone preview.
   */
  public stopPreview(): void {
    if (this.previewPlayer) {
      try {
        this.previewPlayer.pause();
        this.previewPlayer.release();
      } catch (err) {
        console.warn('[RingtoneService] Error releasing preview player:', err);
      }
      this.previewPlayer = null;
    }
    this.isPreviewingNow = false;
  }

  /**
   * Whether the live booking ringtone is currently playing.
   */
  public isRinging(): boolean {
    return this.isRingingNow;
  }

  /**
   * Whether a ringtone preview is currently playing.
   */
  public isPreviewing(): boolean {
    return this.isPreviewingNow;
  }

  /**
   * Get the booking ID currently causing the ringtone to play.
   */
  public getActiveBookingId(): number | string | null {
    return this.activeBookingId;
  }
}

export const RingtoneService = new RingtoneServiceManager();
