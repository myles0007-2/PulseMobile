import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, Album, Playlist, HistoryEntry, LyricLine, PodcastResumeState } from '../types';
import { ThemeName, ThemeColors, themes } from '../theme';
import { player } from '../services/audioPlayer';
import { resolveStreamUrl } from '../services/youtubeService';
import { fetchLyrics, getCurrentLyricIndex } from '../services/lyricsService';
import { fetchSponsorSegments } from '../services/sponsorBlockService';
import { getBluetoothManager, BluetoothRemoteState } from '../services/bluetoothManager';
import { downloadManager } from '../services/downloadManager';
import { computeStats, getEmptyStats } from '../services/analyticsEngine';
import { EQ_PRESET_NAMES, EQ_VOLUME_MULTIPLIERS } from '../services/eqPresets';
import { PodcastSubscription } from '../services/podcastManager';

// CRASH FIX: Seed data files don't exist—use empty defaults instead of crashing on import
const likedSongsRaw: string[] = [];
const playlistsSeedRaw: any[] = [];

/**
 * useStore: Central state management for PulseMobile
 *
 * Concurrency patterns:
 * - _bluetoothLock: Prevents concurrent Bluetooth metadata updates
 * - _volumeLock: Prevents concurrent volume changes from slider + Bluetooth
 * - _isLoadingTrack: Prevents concurrent playTrack calls
 * - _skipGuard + _sponsorSkipPending: Atomic SponsorBlock seek operations
 * - _sleepTimerLock: Prevents concurrent pause from timer + user action
 *
 * Debouncing:
 * - _volumeDebounceTimer: Debounce volume changes by 100ms
 * - _themeChangeTimer: Debounce theme persistence by 500ms
 * - _historyPersistTimer: Debounce history writes by 2s
 *
 * All async operations have guards to prevent race conditions.
 * All persistence operations are debounced to prevent I/O storms.
 */

export type RepeatMode = 'none' | 'all' | 'one';

const PERSIST_KEY = 'pulse_store_v3';
const SEED_KEY = 'pulse_seed_loaded_v1';

// Bluetooth listener cleanup
let bluetoothUnsubscribe: (() => void) | null = null;

// Analytics computation debounce
let statsComputeTimer: NodeJS.Timeout | null = null;

interface PersistedState {
  themeName: ThemeName;
  likedIds: string[];
  playlists: Playlist[];
  history: HistoryEntry[];
  podcastResumes?: Record<string, PodcastResumeState>;
  autoDownloadEnabled?: boolean;
  autoDownloadLikedSongs?: boolean;
  wifiOnly?: boolean;
  eqPreset?: 'flat' | 'rock' | 'pop' | 'podcast';
  podcastSubscriptions?: PodcastSubscription[];
  // Playback persistence (resume feature)
  currentTrackId?: string;
  playbackPosition?: number;
  lastPlayedTime?: number;
}

interface SeedPlaylistEntry {
  name: string;
  id: string;
  tracks: { title: string; artist: string; album: string }[];
}

async function loadPersisted(): Promise<Partial<PersistedState>> {
  try {
    const raw = await AsyncStorage.getItem(PERSIST_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[LoadPersisted] Invalid state structure');
      return {};
    }

    return parsed;
  } catch (error) {
    console.warn('[LoadPersisted] Failed:', error instanceof Error ? error.message : String(error));
    return {};
  }
}

async function savePersisted(s: PersistedState) {
  try {
    const json = JSON.stringify(s);
    // BATTERY FIX: Debounce writes to prevent I/O storms
    await AsyncStorage.setItem(PERSIST_KEY, json);
    console.log('[SavePersisted] Success');
  } catch (error) {
    console.warn('[SavePersisted] Failed:', error instanceof Error ? error.message : String(error));
  }
}

// CRASH FIX: Guard against null/undefined likedSongsRaw
const LIKED_TITLES: Set<string> = new Set(
  (Array.isArray(likedSongsRaw) ? likedSongsRaw : [])
    .filter((s) => typeof s === 'string' && !s.startsWith('spotify:'))
    .map((s) => s.toLowerCase().trim())
);

// Seed playlists (name + track stubs)
const SEED_PLAYLISTS: SeedPlaylistEntry[] = playlistsSeedRaw as SeedPlaylistEntry[];

interface Store {
  // Library
  tracks: Track[];
  albums: Album[];
  isLibraryLoaded: boolean;
  isScanning: boolean;
  scanProgress: number;
  setLibrary: (tracks: Track[], albums: Album[]) => void;
  setScanning: (v: boolean) => void;
  setScanProgress: (v: number) => void;

  // Player
  currentTrack: Track | null;
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  position: number;
  duration: number;
  isLoading: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  volume: number;

  // SponsorBlock
  sponsorSegments: [number, number][];
  _skipGuard: boolean;

  // Bluetooth state lock
  _bluetoothLock: boolean;

  // Volume change lock (prevent concurrent changes)
  _volumeLock: boolean;

  // PlayTrack race condition prevention
  _isLoadingTrack: boolean;

  // Volume debounce (for stable reference)
  _lastVolume: number;
  _volumeDebounceTimer: NodeJS.Timeout | null;

  // Theme change debounce
  _themeChangeTimer: NodeJS.Timeout | null;

  // History persist debounce
  _historyPersistTimer: NodeJS.Timeout | null;

  // Podcast resume tracking debounce
  _lastPodcastResumeSave: number;

  // Sleep timer lock (prevent race with pause)
  _sleepTimerLock: boolean;

  // CRASH FIXES: Initialization state
  _initializationComplete: boolean;
  _initializationFailed: boolean;
  _initializationError: string;
  _isInitialized: boolean;

  // CRASH FIX: Deferred playback restoration (after library loads)
  _pendingPlaybackRestore: { trackId: string; position: number; lastPlayedTime: number } | null;
  _restorePlaybackIfNeeded: () => void;

  // MEMORY FIX: Alert queue management
  alertQueue: Array<{ title: string; message: string }>;
  lastAlertTime: number;
  alertProcessing: boolean;
  _alertProcessingTimeout: ReturnType<typeof setTimeout> | null;
  showAlert: (title: string, message: string) => void;
  _clearAlertQueue: () => void;

  // BATTERY FIX: Download management
  _downloadPaused: boolean;
  _autoDownloadPollTimer: ReturnType<typeof setInterval> | null;
  pauseAllDownloads: () => void;
  resumeAllDownloads: () => void;
  startAutoDownloadPoll: () => void;
  stopAutoDownloadPoll: () => void;

  // Lyrics
  lyrics: LyricLine[];
  currentLyricIndex: number;
  showLyrics: boolean;
  setShowLyrics: (v: boolean) => void;

  // Sleep timer
  sleepTimerEnd: number | null;
  setSleepTimer: (minutes: number | null) => void;

  // Liked songs
  likedIds: Set<string>;
  toggleLike: (track: Track) => void;
  isLiked: (id: string) => boolean;

  // Playlists
  playlists: Playlist[];
  createPlaylist: (name: string) => void;
  deletePlaylist: (id: string) => void;
  renamePlaylist: (id: string, name: string) => void;
  addToPlaylist: (playlistId: string, track: Track) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;

  // History
  history: HistoryEntry[];
  addToHistory: (track: Track) => void;
  clearHistory: () => void;

  // Theme
  themeName: ThemeName;
  colors: ThemeColors;
  setTheme: (t: ThemeName) => void;

  // UI
  showNowPlaying: boolean;
  setShowNowPlaying: (v: boolean) => void;

  // Auto-download
  autoDownloadEnabled: boolean;
  autoDownloadLikedSongs: boolean;
  wifiOnly: boolean;
  setAutoDownload: (enabled: boolean) => void;
  setAutoDownloadLikedSongs: (enabled: boolean) => void;
  setWifiOnly: (v: boolean) => void;

  // Bluetooth remote controls (optional, gracefully degraded if unavailable)
  bluetoothState: BluetoothRemoteState;
  initializeBluetooth: () => Promise<void>;
  bluetoothTogglePlay: () => Promise<void>;
  bluetoothNextTrack: () => Promise<void>;
  bluetoothPrevTrack: () => Promise<void>;

  // YouTube Music authentication (Phase 3)
  youtubeAuthInitialized: boolean;
  youtubeAuthenticated: boolean;
  youtubeCircuitBreakerTripped: boolean;
  initializeYouTubeAuth: () => Promise<void>;
  logoutYouTube: () => Promise<void>;

  // Audio EQ Presets (Phase 4)
  eqPreset: 'flat' | 'rock' | 'pop' | 'podcast';
  setEQPreset: (preset: 'flat' | 'rock' | 'pop' | 'podcast') => void;

  // Podcasts (Phase 5)
  podcastSubscriptions: PodcastSubscription[];
  addPodcastSubscription: (podcast: PodcastSubscription) => void;
  removePodcastSubscription: (podcastId: string) => void;
  podcastResumes: Record<string, PodcastResumeState>;
  updatePodcastResume: (episodeId: string, podcastId: string, position: number, duration: number) => void;
  getPodcastResume: (episodeId: string, podcastId: string) => PodcastResumeState | null;

  // Analytics (Phase 6)
  listeningStats: any; // ListeningStats from analyticsEngine
  computeListeningStats: () => void;

  // Bootstrap & internal
  bootstrap: () => Promise<void>;
  _persist: () => Promise<void>;
  _clearImageCache: () => Promise<void>;
  _applySeedToLibrary: (tracks: Track[]) => void;

  // Player actions
  playTrack: (track: Track, contextQueue?: Track[]) => Promise<void>;
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  seekTo: (s: number) => Promise<void>;
  setRepeat: (r: RepeatMode) => void;
  toggleShuffle: () => void;
  setVolume: (v: number) => Promise<void>;

  // Internal callbacks
  _onStatus: (s: { isPlaying: boolean; position: number; duration: number; isLoading: boolean }) => void;
  _onTrackEnd: () => void;
}

// CRASH FIX: Defer player callback registration to after store creation
// Prevents module-level side effects that could cause crashes on iPhone X
let playerCallbacksRegistered = false;

console.log('[USESTORE] Creating Zustand store...');

let storeCreationError: string | null = null;

export const useStore = create<Store>((set, get) => {
  try {
    console.log('[USESTORE] Store function executing...');

    const state = {
      // Library
      tracks: [], albums: [], isLibraryLoaded: false, isScanning: false, scanProgress: 0,
    setLibrary: (tracks, albums) => {
      set({ tracks, albums, isLibraryLoaded: true });
      get()._applySeedToLibrary(tracks);
    },
    setScanning: (v) => set({ isScanning: v }),
    setScanProgress: (v) => set({ scanProgress: v }),

    // Player
    currentTrack: null, queue: [], currentIndex: -1,
    isPlaying: false, position: 0, duration: 0, isLoading: false,
    repeat: 'none', shuffle: false, volume: 1,

    // SponsorBlock
    sponsorSegments: [], _skipGuard: false,

    // Bluetooth state lock (prevents race conditions)
    _bluetoothLock: false,

    // Volume lock (prevents concurrent changes)
    _volumeLock: false,

    // PlayTrack race condition prevention
    _isLoadingTrack: false,

    // Volume debounce
    _lastVolume: 1,
    _volumeDebounceTimer: null,

    // Theme debounce
    _themeChangeTimer: null,

    // History persist debounce
    _historyPersistTimer: null,

    // Podcast resume tracking debounce
    _lastPodcastResumeSave: 0,

    // Sleep timer lock
    _sleepTimerLock: false,

    // CRASH FIXES: Initialization
    _initializationComplete: false,
    _initializationFailed: false,
    _initializationError: '',
    _isInitialized: false,

    // CRASH FIX: Pending playback restore
    _pendingPlaybackRestore: null,

    // MEMORY FIX: Alert queue
    alertQueue: [],
    lastAlertTime: 0,
    alertProcessing: false,
    _alertProcessingTimeout: null,

    // BATTERY FIX: Download management
    _downloadPaused: false,
    _autoDownloadPollTimer: null,

    // YouTube Music auth (Phase 3)
    youtubeAuthInitialized: false,
    youtubeAuthenticated: false,
    youtubeCircuitBreakerTripped: false,

    // Audio EQ Presets (Phase 4)
    eqPreset: 'flat' as const,

    // Podcasts (Phase 5)
    podcastSubscriptions: [],
    podcastResumes: {},

    // Analytics (Phase 6)
    listeningStats: getEmptyStats(),

    // Lyrics
    lyrics: [], currentLyricIndex: 0, showLyrics: false,
    setShowLyrics: (v) => set({ showLyrics: v }),

    // Sleep timer
    sleepTimerEnd: null,
    setSleepTimer: (minutes) => set({
      sleepTimerEnd: minutes ? Date.now() + minutes * 60 * 1000 : null,
    }),

    // Liked
    likedIds: new Set(),
    toggleLike: (track) => {
      const ids = new Set(get().likedIds);
      if (ids.has(track.id)) ids.delete(track.id);
      else ids.add(track.id);
      set({ likedIds: ids });
      get()._persist();
    },
    isLiked: (id) => get().likedIds.has(id),

    // Playlists
    playlists: [],
    createPlaylist: (name) => {
      const pl: Playlist = { id: Date.now().toString(), name, tracks: [], createdAt: Date.now() };
      set((s) => ({ playlists: [...s.playlists, pl] }));
      get()._persist();
    },
    deletePlaylist: (id) => {
      set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) }));
      get()._persist();
    },
    renamePlaylist: (id, name) => {
      set((s) => ({ playlists: s.playlists.map((p) => p.id === id ? { ...p, name } : p) }));
      get()._persist();
    },
    addToPlaylist: (playlistId, track) => {
      set((s) => ({
        playlists: s.playlists.map((p) =>
          p.id === playlistId && !p.tracks.find((t) => t.id === track.id)
            ? { ...p, tracks: [...p.tracks, track] }
            : p
        ),
      }));
      get()._persist();
    },
    removeFromPlaylist: (playlistId, trackId) => {
      set((s) => ({
        playlists: s.playlists.map((p) =>
          p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p
        ),
      }));
      get()._persist();
    },

    // History
    history: [],
    addToHistory: (track) => {
      const { _historyPersistTimer } = get();
      if (_historyPersistTimer) clearTimeout(_historyPersistTimer);

      const entry: HistoryEntry = { track, playedAt: Date.now() };
      // MEMORY FIX: Cap history to 200 (matches persist size, prevents GC pressure)
      // Each entry ≈ 0.5KB, so 200 = ~100KB memory usage (iPhone X safe)
      set((s) => ({ history: [entry, ...s.history.filter((h) => h.track.id !== track.id)].slice(0, 200) }));

      const timer = setTimeout(() => {
        get()._persist();
        set({ _historyPersistTimer: null });
      }, 2000);

      set({ _historyPersistTimer: timer });
    },
    clearHistory: () => { set({ history: [] }); get()._persist(); },

    // Theme
    themeName: 'dark',
    colors: themes.dark,
    setTheme: (t) => {
      const { _themeChangeTimer } = get();
      if (_themeChangeTimer) clearTimeout(_themeChangeTimer);

      set({ themeName: t, colors: themes[t] });

      const timer = setTimeout(() => {
        get()._persist();
        set({ _themeChangeTimer: null });
      }, 500);

      set({ _themeChangeTimer: timer });
    },

    // UI
    showNowPlaying: false,
    setShowNowPlaying: (v) => set({ showNowPlaying: v }),

    // Auto-download
    autoDownloadEnabled: false,
    autoDownloadLikedSongs: false,
    wifiOnly: true,
    setAutoDownload: (enabled) => {
      set({ autoDownloadEnabled: enabled });
      get()._persist();
    },
    setAutoDownloadLikedSongs: (enabled) => {
      set({ autoDownloadLikedSongs: enabled });
      get()._persist();
    },
    setWifiOnly: (v) => {
      set({ wifiOnly: v });
      get()._persist();
    },

    // Bluetooth (optional, isolated)
    bluetoothState: {
      isAvailable: false,
      isInitialized: false,
      supportedCommands: [],
    },

    initializeBluetooth: async () => {
      try {
        const state = await getBluetoothManager().initialize();
        set({ bluetoothState: state });

        if (state.isInitialized) {
          // Clean up old listener if re-initializing
          if (bluetoothUnsubscribe) bluetoothUnsubscribe();

          // Subscribe to remote commands and store unsubscribe function
          bluetoothUnsubscribe = getBluetoothManager().onRemoteCommand((cmd) => {
            const s = get();
            if (cmd === 'play') s.bluetoothTogglePlay();
            else if (cmd === 'pause') s.bluetoothTogglePlay();
            else if (cmd === 'skip_forward') s.bluetoothNextTrack();
            else if (cmd === 'skip_back') s.bluetoothPrevTrack();
          });
        }
      } catch (error) {
        console.error('Bluetooth init error:', error);
        set({ bluetoothState: { isAvailable: false, isInitialized: false, supportedCommands: [] } });
      }
    },

    bluetoothTogglePlay: async () => {
      // Debounced version of togglePlay - safe for concurrent Bluetooth + UI commands
      const { isPlaying, _bluetoothLock } = get();

      // Prevent overlapping calls
      if (_bluetoothLock) return;

      set({ _bluetoothLock: true });
      try {
        await get().togglePlay();
        // Update Bluetooth metadata after state change
        const { currentTrack, isPlaying: newIsPlaying } = get();
        if (currentTrack && getBluetoothManager()) {
          getBluetoothManager().updatePlaybackState(newIsPlaying);
        }
      } finally {
        set({ _bluetoothLock: false });
      }
    },

    bluetoothNextTrack: async () => {
      const { _bluetoothLock } = get();
      if (_bluetoothLock) return;

      set({ _bluetoothLock: true });
      try {
        await get().nextTrack();
        const { currentTrack } = get();
        if (currentTrack && getBluetoothManager()) {
          getBluetoothManager().updateMetadata({
            title: currentTrack.title,
            artist: currentTrack.artist,
            album: currentTrack.album,
            duration: currentTrack.duration,
          });
        }
      } finally {
        set({ _bluetoothLock: false });
      }
    },

    bluetoothPrevTrack: async () => {
      const { _bluetoothLock } = get();
      if (_bluetoothLock) return;

      set({ _bluetoothLock: true });
      try {
        await get().prevTrack();
        const { currentTrack } = get();
        if (currentTrack && getBluetoothManager()) {
          getBluetoothManager().updateMetadata({
            title: currentTrack.title,
            artist: currentTrack.artist,
            album: currentTrack.album,
            duration: currentTrack.duration,
          });
        }
      } finally {
        set({ _bluetoothLock: false });
      }
    },

    // YouTube Music authentication (Phase 3)
    initializeYouTubeAuth: async () => {
      try {
        const { youtubeMusicAuth } = await import('../services/youtubeMusicAPI');
        const authState = await youtubeMusicAuth.initialize();
        set({
          youtubeAuthInitialized: true,
          youtubeAuthenticated: authState.isAuthenticated,
          youtubeCircuitBreakerTripped: authState.circuitBreakerTripped,
        });
      } catch (error) {
        console.error('YouTube auth init failed:', error);
        set({ youtubeAuthInitialized: true, youtubeAuthenticated: false });
      }
    },

    logoutYouTube: async () => {
      try {
        const { youtubeMusicAuth } = await import('../services/youtubeMusicAPI');
        await youtubeMusicAuth.logout();
        set({ youtubeAuthenticated: false, youtubeCircuitBreakerTripped: false });
      } catch (error) {
        console.error('YouTube logout failed:', error);
      }
    },

    // Set audio EQ preset (Phase 4) — applies perceptual volume compensation, non-blocking.
    setEQPreset: (preset: 'flat' | 'rock' | 'pop' | 'podcast') => {
      set({ eqPreset: preset });
      const multiplier = EQ_VOLUME_MULTIPLIERS[preset] ?? 1.0;
      player.setEqMultiplier(multiplier).catch((e) =>
        console.warn('Failed to apply EQ preset:', e instanceof Error ? e.message : String(e))
      );
    },

    // Add podcast subscription (Phase 5)
    addPodcastSubscription: (podcast: PodcastSubscription) => {
      const current = get().podcastSubscriptions;
      const exists = current.some(p => p.id === podcast.id);
      if (!exists) {
        set({ podcastSubscriptions: [...current, podcast] });
      }
    },

    // Remove podcast subscription (Phase 5)
    removePodcastSubscription: (podcastId: string) => {
      const current = get().podcastSubscriptions;
      set({ podcastSubscriptions: current.filter(p => p.id !== podcastId) });
    },

    // Track podcast episode listen position (Phase 5)
    updatePodcastResume: (episodeId: string, podcastId: string, position: number, duration: number) => {
      const key = `${podcastId}::${episodeId}`;
      const current = get().podcastResumes;
      set({
        podcastResumes: {
          ...current,
          [key]: { episodeId, podcastId, position, duration, lastResumedAt: Date.now() },
        },
      });
    },

    // Get podcast episode resume position (Phase 5)
    getPodcastResume: (episodeId: string, podcastId: string): PodcastResumeState | null => {
      const key = `${podcastId}::${episodeId}`;
      return get().podcastResumes[key] || null;
    },

    // Compute listening statistics from history
    computeListeningStats: () => {
      // PERF FIX: Debounce stats computation (runs O(n) algorithm)
      // Clear existing timer to avoid redundant calcs
      if (statsComputeTimer) clearTimeout(statsComputeTimer);

      statsComputeTimer = setTimeout(() => {
        try {
          const stats = computeStats(get().history);
          set({ listeningStats: stats });
        } catch (e) {
          console.warn('[Analytics] computeStats failed:', e instanceof Error ? e.message : String(e));
          set({ listeningStats: getEmptyStats() });
        }
        statsComputeTimer = null;
      }, 3000); // Wait 3s after last history change before computing
    },

    // Bootstrap: Load persisted state and validate it
    bootstrap: async () => {
      try {
        console.log('[Bootstrap] Starting...');

        const saved = await loadPersisted();
        console.log('[Bootstrap] Loaded persisted state');

        const themeName: ThemeName = (saved.themeName as ThemeName) ?? 'dark';

        // CRASH FIX: Validate saved state structure
        const validThemeName = themes[themeName] ? themeName : 'dark';
        const validLikedIds = Array.isArray(saved.likedIds) ? saved.likedIds : [];
        const validPlaylists = Array.isArray(saved.playlists) ? saved.playlists : [];
        const validHistory = Array.isArray(saved.history) ? saved.history : [];
        const validEqPreset = ['flat', 'rock', 'pop', 'podcast'].includes(saved.eqPreset as string)
          ? (saved.eqPreset as 'flat' | 'rock' | 'pop' | 'podcast')
          : 'flat';
        const validPodcastSubs = Array.isArray(saved.podcastSubscriptions) ? saved.podcastSubscriptions : [];
        const validPodcastResumes = saved.podcastResumes && typeof saved.podcastResumes === 'object' ? saved.podcastResumes : {};

        // Check if seed playlists have been loaded yet
        const seedLoaded = await AsyncStorage.getItem(SEED_KEY);
        let playlists = validPlaylists;

        if (!seedLoaded) {
          const seededPlaylists: Playlist[] = SEED_PLAYLISTS.map((sp) => ({
            id: `seed_${sp.id}`,
            name: sp.name,
            tracks: [],
            createdAt: Date.now(),
          }));
          const existingNames = new Set(playlists.map((p) => p.name));
          for (const sp of seededPlaylists) {
            if (!existingNames.has(sp.name)) playlists = [...playlists, sp];
          }
          try {
            await AsyncStorage.setItem(SEED_KEY, '1');
          } catch (e) {
            console.warn('[Bootstrap] Failed to mark seed as loaded:', e);
          }
        }

        // CRASH FIX: Validate and defer playback restoration
        let pendingRestore = null;
        if (saved.currentTrackId && typeof saved.playbackPosition === 'number' && typeof saved.lastPlayedTime === 'number') {
          if (saved.playbackPosition >= 0 && saved.lastPlayedTime > 0) {
            const daysSincePlayed = (Date.now() - saved.lastPlayedTime) / (1000 * 60 * 60 * 24);
            if (daysSincePlayed < 30) {
              pendingRestore = {
                trackId: saved.currentTrackId,
                position: saved.playbackPosition,
                lastPlayedTime: saved.lastPlayedTime,
              };
            }
          }
        }

        set({
          themeName: validThemeName,
          colors: themes[validThemeName],
          likedIds: new Set(validLikedIds),
          playlists,
          history: validHistory,
          autoDownloadEnabled: saved.autoDownloadEnabled === true,
          autoDownloadLikedSongs: saved.autoDownloadLikedSongs === true,
          wifiOnly: saved.wifiOnly !== false,
          eqPreset: validEqPreset,
          podcastSubscriptions: validPodcastSubs,
          podcastResumes: validPodcastResumes,
          _pendingPlaybackRestore: pendingRestore,
          _isInitialized: true,
        });

        // Non-blocking async initialization
        console.log('[Bootstrap] Initializing Bluetooth...');
        get().initializeBluetooth().catch((e) => {
          console.warn('[Bootstrap] Bluetooth init failed:', e instanceof Error ? e.message : String(e));
        });

        console.log('[Bootstrap] Initializing YouTube auth...');
        get().initializeYouTubeAuth().catch((e) => {
          console.warn('[Bootstrap] YouTube auth init failed:', e instanceof Error ? e.message : String(e));
        });

        // Apply persisted EQ preset so it's active from launch (non-blocking).
        player.setEqMultiplier(EQ_VOLUME_MULTIPLIERS[validEqPreset] ?? 1.0).catch(() => {});

        console.log('[Bootstrap] Complete!');
      } catch (error) {
        console.error('[Bootstrap] Failed:', error instanceof Error ? error.message : String(error));
        // Set safe defaults so app still works
        set({
          themeName: 'dark' as const,
          colors: themes.dark,
          likedIds: new Set(),
          playlists: [],
          history: [],
          _isInitialized: true,
          _initializationFailed: true,
          _initializationError: String(error),
        });
      }
    },

    // CRASH FIX: Restore playback after library loads
    _restorePlaybackIfNeeded: () => {
      const { _pendingPlaybackRestore, tracks } = get();
      if (!_pendingPlaybackRestore || !_pendingPlaybackRestore.trackId || tracks.length === 0) {
        return;
      }

      const daysSincePlayed = (Date.now() - _pendingPlaybackRestore.lastPlayedTime) / (1000 * 60 * 60 * 24);
      if (daysSincePlayed > 30) {
        set({ _pendingPlaybackRestore: null });
        return;
      }

      const resumeTrack = tracks.find((t) => t.id === _pendingPlaybackRestore.trackId);
      if (resumeTrack) {
        const safePosition = Math.min(_pendingPlaybackRestore.position, Math.max(0, resumeTrack.duration - 1));
        set({
          currentTrack: resumeTrack,
          position: safePosition,
          _pendingPlaybackRestore: null,
        });
        console.log('[Playback] Restored:', resumeTrack.title, '@', safePosition, 's');
      } else {
        set({ _pendingPlaybackRestore: null });
      }
    },

    // MEMORY FIX: Alert queue management
    showAlert: (title: string, message: string) => {
      const { alertQueue, lastAlertTime, alertProcessing } = get();
      const now = Date.now();

      // Limit queue size to prevent memory bloat
      const MAX_QUEUE_SIZE = 10;
      if (alertQueue.length >= MAX_QUEUE_SIZE) {
        console.warn('[AlertQueue] Full, dropping alert:', title);
        return;
      }

      if (now - lastAlertTime >= 3000 && !alertProcessing) {
        set({ lastAlertTime: now, alertProcessing: true });
        const { Alert } = require('react-native');
        Alert.alert(title, message);

        // Clear previous timeout if any
        const prevTimeout = get()._alertProcessingTimeout;
        if (prevTimeout) clearTimeout(prevTimeout);

        const timeout = setTimeout(() => {
          const { alertQueue: q } = get();
          set({ alertProcessing: false, _alertProcessingTimeout: null });

          if (q.length > 0) {
            const [next, ...rest] = q;
            set({ alertQueue: rest });
            get().showAlert(next.title, next.message);
          }
        }, 3000);

        set({ _alertProcessingTimeout: timeout });
      } else {
        set({ alertQueue: [...alertQueue, { title, message }] });
      }
    },

    _clearAlertQueue: () => {
      const timeout = get()._alertProcessingTimeout;
      if (timeout) clearTimeout(timeout);
      set({
        alertQueue: [],
        alertProcessing: false,
        lastAlertTime: 0,
        _alertProcessingTimeout: null,
      });
    },

    // BATTERY FIX: Download pause/resume
    pauseAllDownloads: async () => {
      set({ _downloadPaused: true });
      try {
        downloadManager.pauseAll();
      } catch (e) {
        console.warn('[Downloads] Pause failed:', e);
      }
    },

    resumeAllDownloads: async () => {
      set({ _downloadPaused: false });
      try {
        downloadManager.resumeAll();
      } catch (e) {
        console.warn('[Downloads] Resume failed:', e);
      }
    },

    startAutoDownloadPoll: () => {
      const existing = get()._autoDownloadPollTimer;
      if (existing) return;

      const timer = setInterval(() => {
        const { _downloadPaused, autoDownloadEnabled } = get();
        if (_downloadPaused || !autoDownloadEnabled) return;

        // Trigger auto-download check
        // (implementation depends on downloadManager)
      }, 30000); // Poll every 30s

      set({ _autoDownloadPollTimer: timer });
    },

    stopAutoDownloadPoll: () => {
      const timer = get()._autoDownloadPollTimer;
      if (timer) clearInterval(timer);
      set({ _autoDownloadPollTimer: null });
    },

    // Seed matching: run after library scan to match liked titles + playlist stubs
    _applySeedToLibrary: (tracks: Track[]) => {
      const { likedIds, playlists } = get();
      const titleMap = new Map<string, Track>();
      for (const t of tracks) titleMap.set(t.title.toLowerCase().trim(), t);

      // Match liked titles
      const newLikedIds = new Set(likedIds);
      for (const title of LIKED_TITLES) {
        const match = titleMap.get(title);
        if (match) newLikedIds.add(match.id);
      }

      // Populate seed playlists with matched tracks
      const updatedPlaylists = playlists.map((pl) => {
        if (!pl.id.startsWith('seed_')) return pl;
        const seedId = pl.id.replace('seed_', '');
        const seed = SEED_PLAYLISTS.find((s) => `seed_${s.id}` === pl.id || s.name === pl.name);
        if (!seed) return pl;

        const matchedTracks: Track[] = [];
        const seen = new Set<string>();
        for (const stub of seed.tracks) {
          const key = stub.title.toLowerCase().trim();
          const match = titleMap.get(key);
          if (match && !seen.has(match.id)) {
            matchedTracks.push(match);
            seen.add(match.id);
          }
        }
        // Only update if we found tracks and the playlist is currently empty
        if (matchedTracks.length > 0 && pl.tracks.length === 0) {
          return { ...pl, tracks: matchedTracks };
        }
        return pl;
      });

      set({ likedIds: newLikedIds, playlists: updatedPlaylists });
      get()._persist();
    },

    // Internal persist
    _persist: async () => {
      const { themeName, likedIds, playlists, history, autoDownloadEnabled, autoDownloadLikedSongs, wifiOnly, eqPreset, podcastSubscriptions, podcastResumes, currentTrack, position } = get();
      try {
        // Defensive serialization: test stringify before sending to storage
        const stateToSave = {
          themeName,
          likedIds: Array.from(likedIds),
          playlists,
          history: history.slice(0, 200),
          autoDownloadEnabled,
          autoDownloadLikedSongs,
          wifiOnly,
          eqPreset,
          podcastSubscriptions,
          podcastResumes,
          currentTrackId: currentTrack?.id,
          playbackPosition: position,
          lastPlayedTime: Date.now(),
        };

        // Validate can stringify
        try {
          JSON.stringify(stateToSave);
        } catch (serErr) {
          console.error('[_persist] Serialization failed:', serErr instanceof Error ? serErr.message : String(serErr));
          return;
        }

        await savePersisted(stateToSave);
      } catch (e) {
        console.warn('[_persist] Failed:', e instanceof Error ? e.message : String(e));
      }
    },

    // MEMORY FIX: Clear image cache on low-memory warning
    _clearImageCache: async () => {
      try {
        console.log('[Store] Clearing image cache');
        // TODO: If image caching is implemented, clear it here
        // For now, we can clear the currentTrack artwork to free memory
        const { currentTrack } = get();
        if (currentTrack?.artwork) {
          set({ currentTrack: { ...currentTrack, artwork: undefined } });
        }
      } catch (e) {
        console.warn('[Store] Failed to clear image cache:', e);
      }
    },

    // Player actions
    playTrack: async (track, contextQueue) => {
      // CRASH FIX: Guard against undefined/invalid track (e.g. empty artist/album list).
      if (!track || !track.id || !track.uri) {
        console.warn('[PlayTrack] Ignoring invalid track:', track);
        return;
      }

      // Atomic guard: set immediately to prevent concurrent loads
      const { _isLoadingTrack } = get();
      if (_isLoadingTrack) return;
      set({ _isLoadingTrack: true });

      // Strip artwork from queue entries — artwork can be lazy-loaded in TrackItem.
      // Keeps the queue small even with thousands of tracks.
      const stripArt = (t: Track): Track => t.artwork ? { ...t, artwork: undefined } : t;
      const rawQueue = contextQueue ?? [track];
      const queue = rawQueue.map(stripArt);
      const playableTrackStripped = stripArt(track);
      const idx = queue.findIndex((t) => t.id === track.id);

      set({ isLoading: true, lyrics: [], currentLyricIndex: 0, sponsorSegments: [], _skipGuard: false });

      let playableTrack = playableTrackStripped;

      // Three-tier playback strategy: local → YouTube → fallback
      try {
        // Import here to avoid circular dependency
        const { resolvePlayableUrl } = await import('../services/playbackStrategy');
        const source = await resolvePlayableUrl(track);

        if (source) {
          // Tier 1: Local file found
          if (source.source === 'local') {
            playableTrack = { ...playableTrackStripped, uri: source.uri };
            set({ queue, currentIndex: idx, currentTrack: playableTrack });
          }
          // Tier 2: YouTube (resolve stream URL via Invidious/Piped)
          else if (source.source === 'youtube') {
            const videoId = source.uri.replace('yt::', '');
            const streamUrl = await resolveStreamUrl(videoId);
            playableTrack = { ...playableTrackStripped, uri: streamUrl };
            const patchedQueue = queue.map((t) => t.id === track.id ? playableTrack : t);
            set({ queue: patchedQueue, currentIndex: idx, currentTrack: playableTrack });
          }
          // Tier 3: Other sources (podcasts, etc.)
          else {
            playableTrack = { ...playableTrackStripped, uri: source.uri };
            set({ queue, currentIndex: idx, currentTrack: playableTrack });
          }
        } else {
          throw new Error('No playable source found for track');
        }
      } catch (e: any) {
        set({ isLoading: false, _isLoadingTrack: false });
        throw e;
      }

      // EDGE FIX: Wrap playback in try-catch to handle deleted tracks gracefully
      try {
        await player.load(playableTrack);
        await player.play();
        set({ isPlaying: true, isLoading: false, _isLoadingTrack: false });
        get().addToHistory(track);
      } catch (playError) {
        console.error('[PlayTrack] Playback failed:', playError instanceof Error ? playError.message : String(playError));
        set({ isLoading: false, _isLoadingTrack: false, isPlaying: false });

        // Skip to next track if available
        const { queue, currentIndex } = get();
        if (currentIndex + 1 < queue.length) {
          console.log('[PlayTrack] Skipping to next track');
          get().nextTrack().catch((e) => console.warn('[PlayTrack] Skip failed:', e));
        } else {
          console.warn('[PlayTrack] No next track available');
        }
        return;
      }

      if (track.source === 'local' && track.artist !== 'Unknown Artist') {
        fetchLyrics(track.artist, track.title, track.album, track.duration)
          .then((lines) => set({ lyrics: lines }))
          .catch((e) => console.warn('Lyrics fetch failed:', e instanceof Error ? e.message : String(e)));
      }

      if (track.source === 'youtube') {
        const videoId = track.id.replace('yt::', '');
        fetchSponsorSegments(videoId)
          .then((segs) => set({ sponsorSegments: segs }))
          .catch((e) => console.warn('SponsorBlock fetch failed:', e instanceof Error ? e.message : String(e)));
      }

      // Update Bluetooth lock screen metadata with retry on track change (non-blocking)
      if (track.title && track.artist) {
        let retries = 0;
        const updateMetadataWithRetry = async () => {
          try {
            await getBluetoothManager().updateMetadata({
              title: track.title || 'Unknown',
              artist: track.artist || 'Unknown',
              album: track.album || 'Unknown Album',
              duration: track.duration || 0,
            });
          } catch (e) {
            if (retries < 2) {
              retries++;
              await new Promise(r => setTimeout(r, 200));
              await updateMetadataWithRetry();
            }
          }
        };
        updateMetadataWithRetry().catch((e) => console.warn('Bluetooth metadata update failed:', e instanceof Error ? e.message : String(e)));
      }
    },

    togglePlay: async () => {
      const { isPlaying } = get();
      if (isPlaying) {
        await player.pause();
        set({ isPlaying: false });
      } else {
        await player.play();
        set({ isPlaying: true });
      }
      // Bluetooth bandaid: re-sync audio mode to fix play/pause state confusion on headsets
      try {
        const { Audio } = await import('expo-av');
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: true,
          interruptionModeIOS: 1,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
        });
      } catch (e) {
        console.warn('Bluetooth state sync failed:', e);
      }
    },

    nextTrack: async () => {
      const { queue, currentIndex, repeat, shuffle, _isLoadingTrack } = get();
      if (!queue.length || _isLoadingTrack) return;
      if (queue.length === 0) return;

      let nextIdx: number;
      if (shuffle) nextIdx = Math.floor(Math.random() * queue.length);
      else {
        nextIdx = currentIndex + 1;
        if (nextIdx >= queue.length) {
          if (repeat === 'all') nextIdx = 0;
          else return;
        }
      }
      const nextTrack = queue[nextIdx];
      if (nextTrack) await get().playTrack(nextTrack, queue);
    },

    prevTrack: async () => {
      const { queue, currentIndex, position, duration, _isLoadingTrack } = get();
      if (_isLoadingTrack) return;
      if (duration > 0 && position > 3) { await player.seekTo(0); return; }
      const prevIdx = Math.max(0, currentIndex - 1);
      if (queue[prevIdx]) await get().playTrack(queue[prevIdx], queue);
    },

    seekTo: async (s) => { await player.seekTo(s); set({ position: s }); },

    setRepeat: (r) => set({ repeat: r }),
    toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

    setVolume: async (v) => {
      const { _volumeLock, _volumeDebounceTimer } = get();
      if (_volumeLock) return;

      try {
        set({ _volumeLock: true });

        if (_volumeDebounceTimer) clearTimeout(_volumeDebounceTimer);
        set({ _lastVolume: v });

        let failsafeTimer: NodeJS.Timeout | null = null;

        const timer = setTimeout(async () => {
          try {
            const { _lastVolume: currentVolume } = get();
            await player.setVolume(currentVolume);
            set({ volume: currentVolume, _volumeDebounceTimer: null });
            if (failsafeTimer) clearTimeout(failsafeTimer);
          } catch (e) {
            console.error('Volume apply failed:', e instanceof Error ? e.message : String(e));
          } finally {
            set({ _volumeLock: false });
            if (failsafeTimer) clearTimeout(failsafeTimer);
          }
        }, 100);

        failsafeTimer = setTimeout(() => {
          console.warn('Volume lock timeout - force clearing lock');
          set({ _volumeLock: false });
        }, 5000);

        set({ _volumeDebounceTimer: timer });
      } catch (e) {
        console.error('Volume debounce setup failed:', e instanceof Error ? e.message : String(e));
        set({ _volumeLock: false });
      }
    },

    _onStatus: (s) => {
      try {
        const { sponsorSegments, _skipGuard, sleepTimerEnd, lyrics, currentLyricIndex } = get();

        let newLyricIndex = 0;
      if (lyrics.length) {
        const calculatedIndex = getCurrentLyricIndex(lyrics, s.position);
        const timeSinceLast = s.position - (lyrics[currentLyricIndex]?.time ?? 0);
        // Only update if we've moved forward significantly (prevents drift on long tracks)
        newLyricIndex = timeSinceLast > 0 || calculatedIndex > currentLyricIndex ? calculatedIndex : currentLyricIndex;
      }

      set({
        isPlaying: s.isPlaying,
        position: s.position,
        duration: s.duration,
        isLoading: s.isLoading,
        currentLyricIndex: newLyricIndex,
      });

      // PHASE 5: Track podcast episode listen position (debounced every 5 seconds)
      const { currentTrack, _lastPodcastResumeSave } = get();
      if (currentTrack?.source === 'podcast' && Date.now() - _lastPodcastResumeSave > 5000) {
        get().updatePodcastResume(currentTrack.id, currentTrack.album, s.position, s.duration);
        set({ _lastPodcastResumeSave: Date.now() });
      }

      if (s.isPlaying && !_skipGuard && sponsorSegments.length) {
        for (const [start, end] of sponsorSegments) {
          if (s.position >= start - 0.5 && s.position < end) {
            set({ _skipGuard: true });
            player.seekTo(end)
              .catch((e) => console.error('SponsorBlock skip failed:', e))
              .finally(() => set({ _skipGuard: false }));
            return;
          }
        }
      }

      // Prevent re-triggering of same segment if position drifts slightly
      if (s.isPlaying && !_skipGuard && sponsorSegments.length) {
        for (const [start, end] of sponsorSegments) {
          if (s.position >= end && s.position < end + 1) {
            set({ _skipGuard: true });
            setTimeout(() => set({ _skipGuard: false }), 500);
            break;
          }
        }
      }

      const { _sleepTimerLock } = get();
      if (!_sleepTimerLock && sleepTimerEnd && Date.now() >= sleepTimerEnd) {
        set({ _sleepTimerLock: true });
        player.pause()
          .then(() => {
            set({ isPlaying: false, sleepTimerEnd: null });
          })
          .catch((e) => {
            console.error('Sleep timer pause failed:', e);
          })
          .finally(() => {
            set({ _sleepTimerLock: false });
          });
      }

      // Sync Bluetooth playback state (non-blocking)
        getBluetoothManager().updatePlaybackState(s.isPlaying, s.position).catch(() => {});
      } catch (e) {
        console.error('[Store._onStatus] Unhandled error:', e instanceof Error ? e.message : String(e));
      }
    },

    _onTrackEnd: () => {
      try {
        const { repeat } = get();
        if (repeat === 'one') {
          player.seekTo(0)
            .then(() => player.play())
            .catch((e) => console.error('Repeat-one restart failed:', e instanceof Error ? e.message : String(e)));
          return;
        }
        get().nextTrack();
      } catch (e) {
        console.error('[Store._onTrackEnd] Unhandled error:', e instanceof Error ? e.message : String(e));
      }
    },

    _clearAllTimers: () => {
      const { _volumeDebounceTimer, _themeChangeTimer, _historyPersistTimer } = get();
      if (_volumeDebounceTimer) clearTimeout(_volumeDebounceTimer);
      if (_themeChangeTimer) clearTimeout(_themeChangeTimer);
      if (_historyPersistTimer) clearTimeout(_historyPersistTimer);
      set({ _volumeDebounceTimer: null, _themeChangeTimer: null, _historyPersistTimer: null });
    },
    };

    console.log('[USESTORE] Store object created successfully');
    return state;
  } catch (err) {
    storeCreationError = err instanceof Error ? err.message : String(err);
    console.error('[USESTORE] Store creation ERROR:', err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    if (err instanceof Error) console.error('[USESTORE] Stack:', err.stack);
    throw err;
  }
});

if (storeCreationError) {
  console.error('[USESTORE] Store failed with:', storeCreationError);
}

// CRASH FIX: Register player callbacks after store is created, not during module load
export function registerPlayerCallbacks() {
  if (playerCallbacksRegistered) return;
  playerCallbacksRegistered = true;

  try {
    console.log('[Store] Registering player callbacks...');
    player.onStatus((s) => {
      try {
        useStore.getState()._onStatus(s);
      } catch (e) {
        console.error('[Store] _onStatus callback error:', e instanceof Error ? e.message : String(e));
      }
    });
    player.onTrackEnd(() => {
      try {
        useStore.getState()._onTrackEnd();
      } catch (e) {
        console.error('[Store] _onTrackEnd callback error:', e instanceof Error ? e.message : String(e));
      }
    });
    console.log('[Store] Player callbacks registered successfully');
  } catch (e) {
    console.error('[Store] Failed to register player callbacks:', e instanceof Error ? e.message : String(e));
  }
}

export const useColors = () => useStore((s) => s.colors);
