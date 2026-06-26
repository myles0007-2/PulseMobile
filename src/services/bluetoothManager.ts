/**
 * Bluetooth Remote Control Manager
 *
 * Handles Bluetooth headset controls (play/pause/skip/seek).
 * Gracefully degrades if react-native-media-session is unavailable.
 *
 * SAFETY: This service is isolated and optional.
 * If it fails to initialize, app continues normally.
 */

import { Audio } from 'expo-av';

export interface BluetoothRemoteState {
  isAvailable: boolean;
  isInitialized: boolean;
  errorMessage?: string;
  supportedCommands: string[];
}

type RemoteCommandListener = (command: 'play' | 'pause' | 'skip_forward' | 'skip_back' | 'seek') => void;

class BluetoothManager {
  private isInitialized = false;
  private mediaSession: any = null;
  private commandListeners: RemoteCommandListener[] = [];
  private lastCommandTime = 0;
  private DEBOUNCE_MS = 300; // Prevent rapid headset button presses from stacking

  async initialize(): Promise<BluetoothRemoteState> {
    try {
      // Try to load react-native-media-session
      // This is optional - if it doesn't exist, app still works
      try {
        const MediaSession = require('react-native-media-session');
        this.mediaSession = MediaSession;

        // Set up metadata display on lock screen
        MediaSession.setPlaybackState({ state: MediaSession.STATE_PAUSED });

        // Register command listeners (will be called when headset buttons pressed)
        this._setupRemoteCommands();

        this.isInitialized = true;
        console.log('✓ Bluetooth remote controls initialized (react-native-media-session available)');

        return {
          isAvailable: true,
          isInitialized: true,
          supportedCommands: ['play', 'pause', 'skip_forward', 'skip_back'],
        };
      } catch (moduleError) {
        // react-native-media-session not available - this is OK
        console.warn('ℹ react-native-media-session not available. Bluetooth remote controls disabled (app works fine without it).');

        return {
          isAvailable: false,
          isInitialized: false,
          errorMessage: 'react-native-media-session not installed',
          supportedCommands: [],
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('✗ Bluetooth initialization failed:', msg);

      return {
        isAvailable: false,
        isInitialized: false,
        errorMessage: msg,
        supportedCommands: [],
      };
    }
  }

  private _setupRemoteCommands() {
    if (!this.mediaSession) return;

    try {
      const MediaSession = this.mediaSession;

      // Play command
      MediaSession.enablePlayCommand((wasPlaying: boolean) => {
        this._emitCommand('play');
      });

      // Pause command
      MediaSession.enablePauseCommand((wasPlaying: boolean) => {
        this._emitCommand('pause');
      });

      // Skip forward (Android: fast-forward button)
      MediaSession.enableJumpForwardCommand(15, (wasPlaying: boolean) => {
        this._emitCommand('skip_forward');
      });

      // Skip back (Android: rewind button)
      MediaSession.enableJumpBackwardCommand(15, (wasPlaying: boolean) => {
        this._emitCommand('skip_back');
      });

      console.log('✓ Remote commands registered (play/pause/skip_forward/skip_back)');
    } catch (error) {
      console.warn('Failed to setup remote commands:', error);
    }
  }

  private _emitCommand(command: 'play' | 'pause' | 'skip_forward' | 'skip_back' | 'seek') {
    const now = Date.now();

    // Debounce: Headset buttons often fire multiple times per press
    if (now - this.lastCommandTime < this.DEBOUNCE_MS) {
      return;
    }
    this.lastCommandTime = now;

    console.log(`🎧 Bluetooth command received: ${command}`);

    // RACE CONDITION FIX: Copy listeners array to prevent crash if listeners modified during iteration
    const listenersCopy = [...this.commandListeners];
    for (const listener of listenersCopy) {
      try {
        listener(command);
      } catch (error) {
        console.error('Error in command listener:', error);
      }
    }
  }

  /**
   * Register callback to receive Bluetooth commands
   * Returns unsubscribe function
   */
  onRemoteCommand(listener: RemoteCommandListener): () => void {
    this.commandListeners.push(listener);

    // Return unsubscribe function
    return () => {
      this.commandListeners = this.commandListeners.filter(l => l !== listener);
    };
  }

  /**
   * Update lock screen metadata (what's currently playing)
   */
  async updateMetadata(track: {
    title: string;
    artist: string;
    album?: string;
    artwork?: string;
    duration?: number;
  }) {
    if (!this.mediaSession || !this.isInitialized) return;

    try {
      this.mediaSession.setPlaybackState({
        state: this.mediaSession.STATE_PLAYING,
        position: 0,
      });

      // Set metadata for lock screen display
      // Note: Not all properties supported on all platforms
      this.mediaSession.setMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || 'Unknown Album',
        artwork: track.artwork,
        duration: track.duration ? Math.floor(track.duration * 1000) : 0, // milliseconds
      });
    } catch (error) {
      console.warn('Failed to update metadata:', error);
    }
  }

  /**
   * Update playback state (playing/paused)
   */
  async updatePlaybackState(isPlaying: boolean, position?: number) {
    if (!this.mediaSession || !this.isInitialized) return;

    try {
      this.mediaSession.setPlaybackState({
        state: isPlaying ? this.mediaSession.STATE_PLAYING : this.mediaSession.STATE_PAUSED,
        position: position ? Math.floor(position * 1000) : 0, // milliseconds
      });
    } catch (error) {
      console.warn('Failed to update playback state:', error);
    }
  }

  /**
   * Cleanup (called on app exit or when disabling Bluetooth)
   */
  async shutdown() {
    this.commandListeners = [];
    this.isInitialized = false;
    this.mediaSession = null;
  }
}

// CRASH FIX: Defer instantiation from module load to useEffect
let _instance: BluetoothManager | null = null;
export function getBluetoothManager(): BluetoothManager {
  if (!_instance) _instance = new BluetoothManager();
  return _instance;
}
