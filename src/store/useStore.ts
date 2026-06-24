import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, Album, Playlist, HistoryEntry, LyricLine } from '../types';
import { ThemeName, ThemeColors, themes } from '../theme';
import { player } from '../services/audioPlayer';
import { resolveStreamUrl } from '../services/youtubeService';
import { fetchLyrics, getCurrentLyricIndex } from '../services/lyricsService';
import { fetchSponsorSegments } from '../services/sponsorBlockService';
import { bluetoothManager, BluetoothRemoteState } from '../services/bluetoothManager';

// Seed data imports
import likedSongsRaw from '../data/liked_songs.json';
import playlistsSeedRaw from '../data/playlists_seed.json';

export type RepeatMode = 'none' | 'all' | 'one';

const PERSIST_KEY = 'pulse_store_v3';
const SEED_KEY = 'pulse_seed_loaded_v1';

// Bluetooth listener cleanup
let bluetoothUnsubscribe: (() => void) | null = null;

interface PersistedState {
  themeName: ThemeName;
  likedIds: string[];
  playlists: Playlist[];
  history: HistoryEntry[];
  autoDownloadEnabled?: boolean;
  autoDownloadLikedSongs?: boolean;
  wifiOnly?: boolean;
}

interface SeedPlaylistEntry {
  name: string;
  id: string;
  tracks: { title: string; artist: string; album: string }[];
}

async function loadPersisted(): Promise<Partial<PersistedState>> {
  try {
    const raw = await AsyncStorage.getItem(PERSIST_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function savePersisted(s: PersistedState) {
  try {
    await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(s));
  } catch {}
}

// Titles from liked_songs.json that are plain strings (not Spotify URIs)
const LIKED_TITLES: Set<string> = new Set(
  (likedSongsRaw as string[])
    .filter((s) => !s.startsWith('spotify:'))
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
  _sponsorSkipPending: boolean;

  // Bluetooth state lock
  _bluetoothLock: boolean;

  // PlayTrack race condition prevention
  _isLoadingTrack: boolean;

  // Volume debounce (for stable reference)
  _lastVolume: number;
  _volumeDebounceTimer: NodeJS.Timeout | null;

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

  // Bootstrap & internal
  bootstrap: () => Promise<void>;
  _persist: () => void;
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

export const useStore = create<Store>((set, get) => {
  player.onStatus((s) => get()._onStatus(s));
  player.onTrackEnd(() => get()._onTrackEnd());

  return {
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
    sponsorSegments: [], _skipGuard: false, _sponsorSkipPending: false,

    // Bluetooth state lock (prevents race conditions)
    _bluetoothLock: false,

    // PlayTrack race condition prevention
    _isLoadingTrack: false,

    // Volume debounce
    _lastVolume: 1,
    _volumeDebounceTimer: null,

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
      const entry: HistoryEntry = { track, playedAt: Date.now() };
      set((s) => ({ history: [entry, ...s.history.filter((h) => h.track.id !== track.id)].slice(0, 200) }));
      get()._persist();
    },
    clearHistory: () => { set({ history: [] }); get()._persist(); },

    // Theme
    themeName: 'dark',
    colors: themes.dark,
    setTheme: (t) => {
      set({ themeName: t, colors: themes[t] });
      get()._persist();
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
        const state = await bluetoothManager.initialize();
        set({ bluetoothState: state });

        if (state.isInitialized) {
          // Clean up old listener if re-initializing
          if (bluetoothUnsubscribe) bluetoothUnsubscribe();

          // Subscribe to remote commands and store unsubscribe function
          bluetoothUnsubscribe = bluetoothManager.onRemoteCommand((cmd) => {
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
        if (currentTrack && bluetoothManager) {
          bluetoothManager.updatePlaybackState(newIsPlaying);
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
        if (currentTrack && bluetoothManager) {
          bluetoothManager.updateMetadata({
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
        if (currentTrack && bluetoothManager) {
          bluetoothManager.updateMetadata({
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

    // Bootstrap
    bootstrap: async () => {
      const saved = await loadPersisted();
      const themeName: ThemeName = (saved.themeName as ThemeName) ?? 'dark';

      // Check if seed playlists have been loaded yet
      const seedLoaded = await AsyncStorage.getItem(SEED_KEY);
      let playlists = saved.playlists ?? [];

      if (!seedLoaded) {
        // First launch — create skeleton playlists from seed data
        const seededPlaylists: Playlist[] = SEED_PLAYLISTS.map((sp) => ({
          id: `seed_${sp.id}`,
          name: sp.name,
          tracks: [], // will be populated by _applySeedToLibrary after scan
          createdAt: Date.now(),
        }));
        // Merge with any existing playlists (avoid duplicates by name)
        const existingNames = new Set(playlists.map((p) => p.name));
        for (const sp of seededPlaylists) {
          if (!existingNames.has(sp.name)) playlists = [...playlists, sp];
        }
        await AsyncStorage.setItem(SEED_KEY, '1');
      }

      set({
        themeName,
        colors: themes[themeName],
        likedIds: new Set(saved.likedIds ?? []),
        playlists,
        history: saved.history ?? [],
        autoDownloadEnabled: saved.autoDownloadEnabled ?? false,
        autoDownloadLikedSongs: saved.autoDownloadLikedSongs ?? false,
        wifiOnly: saved.wifiOnly ?? true,
      });

      // Initialize Bluetooth (non-blocking, graceful degradation if unavailable)
      // This runs asynchronously and doesn't block the bootstrap
      get().initializeBluetooth().catch((e) => {
        console.warn('Bluetooth initialization failed (app works fine without it):', e);
      });
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
    _persist: () => {
      const { themeName, likedIds, playlists, history, autoDownloadEnabled, autoDownloadLikedSongs, wifiOnly } = get();
      savePersisted({
        themeName,
        likedIds: Array.from(likedIds),
        playlists,
        history: history.slice(0, 200),
        autoDownloadEnabled,
        autoDownloadLikedSongs,
        wifiOnly,
      });
    },

    // Player actions
    playTrack: async (track, contextQueue) => {
      const { _isLoadingTrack } = get();
      if (_isLoadingTrack) return;

      // Strip artwork from queue entries — artwork can be lazy-loaded in TrackItem.
      // Keeps the queue small even with thousands of tracks.
      const stripArt = (t: Track): Track => t.artwork ? { ...t, artwork: undefined } : t;
      const rawQueue = contextQueue ?? [track];
      const queue = rawQueue.map(stripArt);
      const playableTrackStripped = stripArt(track);
      const idx = queue.findIndex((t) => t.id === track.id);

      set({ isLoading: true, lyrics: [], currentLyricIndex: 0, sponsorSegments: [], _skipGuard: false, _isLoadingTrack: true });

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

      await player.load(playableTrack);
      await player.play();
      set({ isPlaying: true, isLoading: false, _isLoadingTrack: false });

      get().addToHistory(track);

      if (track.source === 'local' && track.artist !== 'Unknown Artist') {
        fetchLyrics(track.artist, track.title, track.album, track.duration)
          .then((lines) => set({ lyrics: lines }))
          .catch(() => {});
      }

      if (track.source === 'youtube') {
        const videoId = track.id.replace('yt::', '');
        fetchSponsorSegments(videoId)
          .then((segs) => set({ sponsorSegments: segs }))
          .catch(() => {});
      }

      // Update Bluetooth lock screen metadata with retry on track change (non-blocking)
      let retries = 0;
      const updateMetadataWithRetry = async () => {
        try {
          await bluetoothManager.updateMetadata({
            title: track.title,
            artist: track.artist,
            album: track.album,
            duration: track.duration,
          });
        } catch (e) {
          if (retries < 2) {
            retries++;
            await new Promise(r => setTimeout(r, 200));
            await updateMetadataWithRetry();
          }
        }
      };
      updateMetadataWithRetry().catch(() => {});
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
      let nextIdx: number;
      if (shuffle) nextIdx = Math.floor(Math.random() * queue.length);
      else {
        nextIdx = currentIndex + 1;
        if (nextIdx >= queue.length) {
          if (repeat === 'all') nextIdx = 0;
          else return;
        }
      }
      await get().playTrack(queue[nextIdx], queue);
    },

    prevTrack: async () => {
      const { queue, currentIndex, position, _isLoadingTrack } = get();
      if (_isLoadingTrack) return;
      if (position > 3) { await player.seekTo(0); return; }
      const prevIdx = Math.max(0, currentIndex - 1);
      if (queue[prevIdx]) await get().playTrack(queue[prevIdx], queue);
    },

    seekTo: async (s) => { await player.seekTo(s); set({ position: s }); },

    setRepeat: (r) => set({ repeat: r }),
    toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

    setVolume: async (v) => {
      const { _volumeDebounceTimer, _lastVolume } = get();
      if (_volumeDebounceTimer) clearTimeout(_volumeDebounceTimer);

      set({ _lastVolume: v });

      const timer = setTimeout(async () => {
        const { _lastVolume: currentVolume } = get();
        await player.setVolume(currentVolume);
        set({ volume: currentVolume, _volumeDebounceTimer: null });
      }, 100);

      set({ _volumeDebounceTimer: timer });
    },

    _onStatus: (s) => {
      const { sponsorSegments, _skipGuard, _sponsorSkipPending, sleepTimerEnd, lyrics } = get();
      set({
        isPlaying: s.isPlaying,
        position: s.position,
        duration: s.duration,
        isLoading: s.isLoading,
        currentLyricIndex: lyrics.length ? getCurrentLyricIndex(lyrics, s.position) : 0,
      });

      if (s.isPlaying && !_skipGuard && !_sponsorSkipPending && sponsorSegments.length) {
        for (const [start, end] of sponsorSegments) {
          if (s.position >= start - 0.5 && s.position < end) {
            set({ _skipGuard: true, _sponsorSkipPending: true });
            player.seekTo(end)
              .catch((e) => console.error('SponsorBlock skip failed:', e))
              .finally(() => set({ _skipGuard: false, _sponsorSkipPending: false }));
            break;
          }
        }
      }

      if (sleepTimerEnd && Date.now() >= sleepTimerEnd) {
        player.pause();
        set({ isPlaying: false, sleepTimerEnd: null });
      }

      // Sync Bluetooth playback state (non-blocking)
      bluetoothManager.updatePlaybackState(s.isPlaying, s.position).catch(() => {});
    },

    _onTrackEnd: () => {
      const { repeat } = get();
      if (repeat === 'one') { player.seekTo(0).then(() => player.play()); return; }
      get().nextTrack();
    },
  } as Store;
});

export const useColors = () => useStore((s) => s.colors);
