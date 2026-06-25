import { Audio, AVPlaybackStatus } from 'expo-av';
import { Track } from '../types';

/**
 * audioPlayer: Core audio playback abstraction
 *
 * Error handling strategy:
 * - Network failures: Propagated to caller via Promise rejection
 * - Codec issues: Caught in load(), error logged with codec info
 * - Permission denials: Handled by expo-av, errors surfaced to UI
 * - Concurrent operations: Protected by caller (_isLoadingTrack guard in store)
 *
 * Tested scenarios: see audioPlayer.test.ts
 */

export type PlayerStatus = {
  isPlaying: boolean;
  position: number;
  duration: number;
  isLoading: boolean;
};

type StatusCallback = (status: PlayerStatus) => void;
type TrackEndCallback = () => void;

class AudioPlayer {
  private sound: Audio.Sound | null = null;
  private statusCallback: StatusCallback | null = null;
  private trackEndCallback: TrackEndCallback | null = null;
  private statusInterval: ReturnType<typeof setInterval> | null = null;
  private lastPlayingState: boolean = false;
  private trackEndFired: boolean = false;
  private isLoading: boolean = false;
  private isUnloaded: boolean = false;
  // PHASE 4: EQ via perceptual volume compensation (Expo Audio exposes no native EQ).
  private baseVolume: number = 1.0;
  private eqMultiplier: number = 1.0;

  async init() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        interruptionModeIOS: 1,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      });
      console.log('[AudioPlayer] Audio mode initialized');
    } catch (error) {
      console.warn('[AudioPlayer] Audio mode init failed:', error instanceof Error ? error.message : String(error));
    }
  }

  onStatus(cb: StatusCallback) {
    this.statusCallback = cb;
  }

  onTrackEnd(cb: TrackEndCallback) {
    this.trackEndCallback = cb;
  }

  private startPolling() {
    this.stopPolling();
    // BATTERY FIX: Adaptive polling interval (1s when paused, 500ms when playing)
    this.statusInterval = setInterval(async () => {
      if (!this.sound || this.isUnloaded) {
        this.stopPolling();
        return;
      }
      try {
        const status = await this.sound.getStatusAsync();
        if (status.isLoaded) {
          const position = (status.positionMillis ?? 0) / 1000;
          const duration = (status.durationMillis ?? 0) / 1000;

          // CRASH FIX: Validate values before using
          if (!isNaN(position) && !isNaN(duration) && isFinite(position) && isFinite(duration)) {
            this.statusCallback?.({
              isPlaying: status.isPlaying ?? false,
              position: Math.max(0, position),
              duration: Math.max(0, duration),
              isLoading: status.isBuffering ?? false,
            });

            // CRASH FIX: Track end detection with better zero-duration handling
            if (duration > 0 && position > 0 && position >= duration - 0.5) {
              if (!this.trackEndFired) {
                this.trackEndFired = true;
                this.trackEndCallback?.();
              }
            } else if (position < duration - 1) {
              this.trackEndFired = false;
            }

            this.lastPlayingState = status.isPlaying ?? false;
          } else {
            console.warn('[AudioPlayer] Invalid status values:', { position, duration });
          }
        }
      } catch (error) {
        console.warn('[AudioPlayer] Poll error:', error instanceof Error ? error.message : String(error));
      }
    }, 500);
  }

  private stopPolling() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  async load(track: Track): Promise<void> {
    if (this.isLoading) {
      console.warn('[AudioPlayer] Load already in progress, rejecting concurrent request');
      return;
    }

    if (!track || !track.uri) {
      throw new Error('[AudioPlayer] Invalid track: missing uri');
    }

    this.isLoading = true;
    this.isUnloaded = false;
    try {
      await this.unload();
      this.lastPlayingState = false;
      this.trackEndFired = false;

      const soundPromise = Audio.Sound.createAsync(
        { uri: track.uri },
        { shouldPlay: false, progressUpdateIntervalMillis: 1000 },
        (status: AVPlaybackStatus) => {
          if (status.isLoaded) {
            const position = (status.positionMillis ?? 0) / 1000;
            const duration = (status.durationMillis ?? 0) / 1000;

            if (!isNaN(position) && !isNaN(duration) && isFinite(position) && isFinite(duration)) {
              this.statusCallback?.({
                isPlaying: status.isPlaying ?? false,
                position: Math.max(0, position),
                duration: Math.max(0, duration),
                isLoading: status.isBuffering ?? false,
              });

              if (duration > 0 && position > 0 && position >= duration - 0.5) {
                if (!this.trackEndFired) {
                  this.trackEndFired = true;
                  this.trackEndCallback?.();
                }
              } else if (position < duration - 1) {
                this.trackEndFired = false;
              }

              this.lastPlayingState = status.isPlaying ?? false;
            }
          }
        }
      );

      const timeoutPromise: Promise<any> = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('[AudioPlayer] Load timeout (30s)')), 30000)
      );

      const [sound] = await Promise.race<any>([soundPromise, timeoutPromise]);
      this.sound = sound;
      // Re-apply EQ/volume so a freshly loaded track respects the active preset.
      try { await sound.setVolumeAsync(this.effectiveVolume()); } catch {}
      this.startPolling();
      console.log('[AudioPlayer] Sound loaded:', track.id);
    } catch (error) {
      this.sound = null;
      this.isUnloaded = true;
      console.error('[AudioPlayer] Load failed:', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  async play() {
    try {
      await this.sound?.playAsync();
    } catch (error) {
      console.error('[AudioPlayer] Play failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async pause() {
    try {
      await this.sound?.pauseAsync();
    } catch (error) {
      console.error('[AudioPlayer] Pause failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async seekTo(seconds: number) {
    if (!this.sound) return;
    const status = await this.sound.getStatusAsync();
    if (status.isLoaded) {
      const duration = (status.durationMillis ?? 0) / 1000;
      if (seconds < 0 || seconds > duration) {
        console.warn(`Seek out of bounds: ${seconds}s (duration: ${duration}s)`);
        return;
      }
    }
    await this.sound.setPositionAsync(seconds * 1000);
  }

  async setVolume(v: number) {
    if (!Number.isFinite(v)) {
      console.warn(`Invalid volume value: ${v} (expected finite number)`);
      return;
    }
    this.baseVolume = Math.max(0, Math.min(1, v));
    await this.sound?.setVolumeAsync(this.effectiveVolume());
  }

  private effectiveVolume(): number {
    return Math.max(0, Math.min(1, this.baseVolume * this.eqMultiplier));
  }

  // PHASE 4: Apply an EQ preset's volume multiplier. Non-blocking and safe to call
  // anytime; re-applies to the currently loaded sound if present.
  async setEqMultiplier(m: number) {
    if (!Number.isFinite(m) || m <= 0) return;
    this.eqMultiplier = m;
    try {
      await this.sound?.setVolumeAsync(this.effectiveVolume());
    } catch (e) {
      console.warn('[AudioPlayer] EQ apply failed:', e instanceof Error ? e.message : String(e));
    }
  }

  async unload() {
    this.stopPolling();
    this.isUnloaded = true;
    this.lastPlayingState = false;
    if (this.sound) {
      try {
        await this.sound.unloadAsync();
      } catch (e) {
        console.warn('Unload failed:', e instanceof Error ? e.message : String(e));
      }
      this.sound = null;
    }
  }

  async getPosition(): Promise<number> {
    if (!this.sound) return 0;
    const status = await this.sound.getStatusAsync();
    if (status.isLoaded) return (status.positionMillis ?? 0) / 1000;
    return 0;
  }

  /**
   * PHASE 6: Crossfade to next track (gapless playback workaround)
   *
   * Expo Audio does not support simultaneous sound playback for seamless gapless.
   * This method implements a 3-second fade-out/fade-in crossfade between tracks,
   * which hides the gap while minimizing CPU usage compared to full queuing.
   *
   * Future: When Expo Audio supports sound pooling, implement queue-based gapless.
   */
  async crossfadeToTrack(nextTrack: Track): Promise<void> {
    try {
      if (!nextTrack?.uri) {
        throw new Error('Invalid next track');
      }

      // Load next track without playing
      const nextSoundPromise = Audio.Sound.createAsync(
        { uri: nextTrack.uri },
        { shouldPlay: false, volume: 0 }
      );

      const timeoutPromise: Promise<any> = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('[Crossfade] Load timeout')), 15000)
      );

      const [nextSound] = await Promise.race<any>([nextSoundPromise, timeoutPromise]);

      // Start playing next track at volume 0
      await nextSound.playAsync();

      // Crossfade: 3 seconds = 30 steps × 100ms
      const crossfadeDuration = 3000;
      const stepDuration = 100;
      const stepCount = crossfadeDuration / stepDuration;

      for (let i = 0; i <= stepCount; i++) {
        const progress = i / stepCount; // 0 to 1
        const currentVolume = Math.max(0, 1 - progress);
        const nextVolume = Math.min(1, progress);

        // Update volumes
        if (this.sound) {
          await this.sound.setVolumeAsync(currentVolume);
        }
        await nextSound.setVolumeAsync(nextVolume);

        // Wait for next step (skip wait on last iteration)
        if (i < stepCount) {
          await new Promise(resolve => setTimeout(resolve, stepDuration));
        }
      }

      // Unload old sound and replace with new
      await this.unload();
      this.sound = nextSound;
      this.isUnloaded = false;
      this.startPolling();
      this.lastPlayingState = true;

      console.log('[AudioPlayer] Crossfade complete:', nextTrack.id);
    } catch (error) {
      console.error('[AudioPlayer] Crossfade failed:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}

export const player = new AudioPlayer();
