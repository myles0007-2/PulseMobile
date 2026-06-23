import { Audio, AVPlaybackStatus } from 'expo-av';
import { Track } from '../types';

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
      if (!this.sound) return;
      try {
        const status = await this.sound.getStatusAsync();
        if (status.isLoaded) {
          this.statusCallback?.({
            isPlaying: status.isPlaying,
            position: (status.positionMillis ?? 0) / 1000,
            duration: (status.durationMillis ?? 0) / 1000,
            isLoading: status.isBuffering,
          });
        }
      } catch {}
    }, 500);
  }

  private stopPolling() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
  }

  async load(track: Track): Promise<void> {
    await this.unload();
    const { sound } = await Audio.Sound.createAsync(
      { uri: track.uri },
      { shouldPlay: false, progressUpdateIntervalMillis: 500 },
      (status: AVPlaybackStatus) => {
        if (status.isLoaded) {
          this.statusCallback?.({
            isPlaying: status.isPlaying,
            position: (status.positionMillis ?? 0) / 1000,
            duration: (status.durationMillis ?? 0) / 1000,
            isLoading: status.isBuffering ?? false,
          });
          if (status.didJustFinish) {
            this.trackEndCallback?.();
          }
        }
      }
    );
    this.sound = sound;
    this.startPolling();
  }

  async play() {
    await this.sound?.playAsync();
  }

  async pause() {
    await this.sound?.pauseAsync();
  }

  async seekTo(seconds: number) {
    await this.sound?.setPositionAsync(seconds * 1000);
  }

  async setVolume(v: number) {
    await this.sound?.setVolumeAsync(Math.max(0, Math.min(1, v)));
  }

  async unload() {
    this.stopPolling();
    if (this.sound) {
      try {
        await this.sound.unloadAsync();
      } catch {}
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
