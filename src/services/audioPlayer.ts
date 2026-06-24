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

  async init() {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      interruptionModeIOS: 1, // DoNotMix
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });
  }

  onStatus(cb: StatusCallback) {
    this.statusCallback = cb;
  }

  onTrackEnd(cb: TrackEndCallback) {
    this.trackEndCallback = cb;
  }

  private startPolling() {
    this.stopPolling();
    this.statusInterval = setInterval(async () => {
      if (!this.sound || this.isUnloaded) return;
      try {
        const status = await this.sound.getStatusAsync();
        if (status.isLoaded) {
          const position = (status.positionMillis ?? 0) / 1000;
          const duration = (status.durationMillis ?? 0) / 1000;
          this.statusCallback?.({
            isPlaying: status.isPlaying,
            position,
            duration,
            isLoading: status.isBuffering,
          });
          this.lastPlayingState = status.isPlaying;
        }
      } catch (error) {
        console.warn('Status poll error:', error instanceof Error ? error.message : String(error));
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
      console.warn('Load already in progress');
      return;
    }

    this.isLoading = true;
    this.isUnloaded = false;
    try {
      await this.unload();
      this.lastPlayingState = false;
      this.trackEndFired = false;
      const createWithTimeout = Promise.race([
        Audio.Sound.createAsync(
          { uri: track.uri },
          { shouldPlay: false, progressUpdateIntervalMillis: 500 },
          (status: AVPlaybackStatus) => {
            if (status.isLoaded) {
              const position = (status.positionMillis ?? 0) / 1000;
              const duration = (status.durationMillis ?? 0) / 1000;
              this.statusCallback?.({
                isPlaying: status.isPlaying,
                position,
                duration,
                isLoading: status.isBuffering ?? false,
              });
              if (!this.trackEndFired && this.lastPlayingState && !status.isPlaying && duration > 0 && position > 0 && position >= duration - 0.5) {
                this.trackEndFired = true;
                this.trackEndCallback?.();
              }
              this.lastPlayingState = status.isPlaying;
            }
          }
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Audio load timeout (30s)')), 30000)
        ),
      ]);
      const { sound } = await createWithTimeout;
      this.sound = sound;
      this.startPolling();
    } catch (error) {
      console.error('Load audio failed:', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  async play() {
    await this.sound?.playAsync();
  }

  async pause() {
    await this.sound?.pauseAsync();
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
    await this.sound?.setVolumeAsync(Math.max(0, Math.min(1, v)));
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
}

export const player = new AudioPlayer();
