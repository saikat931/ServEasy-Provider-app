import { Vibration, Platform } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer, AudioSource } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { loadRingtoneSettings, RingtoneSettings } from './RingtoneSettingsStorage';

// Bundled copyright-safe default ringtone asset
const DEFAULT_RINGTONE_ASSET = require('../../assets/audio/serveasy_booking_ringtone.wav');

class RingtoneServiceManager {
  private player: AudioPlayer | null = null;
  private previewPlayer: AudioPlayer | null = null;
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
    try {
      await setAudioModeAsync({
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
  private async resolveAudioSource(settings: RingtoneSettings): Promise<AudioSource> {
    if (settings.type === 'custom' && settings.customFileUri) {
      try {
        const info = await FileSystem.getInfoAsync(settings.customFileUri);
        if (info.exists) {
          return { uri: settings.customFileUri };
        }
        console.warn('[RingtoneService] Custom audio file missing, reverting to default ringtone.');
      } catch (e) {
        console.warn('[RingtoneService] Error inspecting custom audio file:', e);
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
      await this.ensureAudioMode();

      // If previewing, stop preview first
      this.stopPreview();

      // Release any existing player to prevent overlapping sounds
      this.stopRinging();

      const settings = await loadRingtoneSettings();
      const source = await this.resolveAudioSource(settings);

      const player = createAudioPlayer(source);
      player.loop = true;
      player.volume = settings.volume ?? 1.0;
      player.play();

      this.player = player;
      this.activeBookingId = bookingId;
      this.isRingingNow = true;

      // Start repeating vibration alert if enabled
      if (settings.vibrationEnabled) {
        try {
          // Vibration pattern: wait 0ms, vibrate 800ms, wait 400ms, vibrate 800ms, wait 600ms
          Vibration.vibrate([0, 800, 400, 800, 600], true);
          this.isVibrating = true;
        } catch (vErr) {
          console.warn('[RingtoneService] Vibration trigger failed:', vErr);
        }
      }

      console.log(`[RingtoneService] Started continuous ringtone for booking #${bookingId}`);
      return true;
    } catch (err) {
      console.error('[RingtoneService] Failed to start ringtone:', err);
      this.stopRinging();
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
    try {
      await this.ensureAudioMode();
      this.stopRinging();
      this.stopPreview();

      let source: AudioSource = DEFAULT_RINGTONE_ASSET;

      if (customUri) {
        const info = await FileSystem.getInfoAsync(customUri);
        if (info.exists) {
          source = { uri: customUri };
        }
      } else {
        const settings = await loadRingtoneSettings();
        source = await this.resolveAudioSource(settings);
      }

      const player = createAudioPlayer(source);
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
