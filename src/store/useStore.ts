import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, Album, Playlist, HistoryEntry, LyricLine } from '../types';
import { ThemeName, ThemeColors, themes } from '../theme';
import { player } from '../services/audioPlayer';
import { resolveStreamUrl } from '../services/youtubeService';
import { fetchLyrics, getCurrentLyricIndex } from '../services/lyricsService';
import { fetchSponsorSegments } from '../services/sponsorBlockService';

// Seed data imports
import likedSongsRaw from '../data/liked_songs.json';
import playlistsSeedRaw from '../data/playlists_seed.json';

export type RepeatMode = 'none' | 'all' | 'one';

const PERSIST_KEY = 'pulse_store_v3';
const SEED_KEY = 'pulse_seed_loaded_v1';

interface PersistedState {
  themeName: ThemeName;
  likedIds: string[];
  playlists: Playlist[];
  history: HistoryEntry[];
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
    sponsorSegments: [], _skipGuard: false,

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
      const { themeName, likedIds, playlists, history } = get();
      savePersisted({
        themeName,
        likedIds: Array.from(likedIds),
        playlists,
        history: history.slice(0, 200),
      });
    },

    // Player actions
    playTrack: async (track, contextQueue) => {
      // Strip artwork from queue entries — artwork can be lazy-loaded in TrackItem.
      // Keeps the queue small even with thousands of tracks.
      const stripArt = (t: Track): Track => t.artwork ? { ...t, artwork: undefined } : t;
      const rawQueue = contextQueue ?? [track];
      const queue = rawQueue.map(stripArt);
      const playableTrackStripped = stripArt(track);
      const idx = queue.findIndex((t) => t.id === track.id);

      set({ isLoading: true, lyrics: [], currentLyricIndex: 0, sponsorSegments: [], _skipGuard: false });

      let playableTrack = playableTrackStripped;
      if (track.source === 'youtube' && track.uri.startsWith('yt::')) {
        try {
          const videoId = track.uri.replace('yt::', '');
          const streamUrl = await resolveStreamUrl(videoId);
          playableTrack = { ...playableTrackStripped, uri: streamUrl };
          const patchedQueue = queue.map((t) => t.id === track.id ? playableTrack : t);
          set({ queue: patchedQueue, currentIndex: idx, currentTrack: playableTrack });
        } catch (e) {
          set({ isLoading: false });
          throw e;
        }
      } else {
        set({ queue, currentIndex: idx, currentTrack: playableTrackStripped });
      }

      await player.load(playableTrack);
      await player.play();
      set({ isPlaying: true, isLoading: false });

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
    },

    togglePlay: async () => {
      const { isPlaying } = get();
      if (isPlaying) { await player.pause(); set({ isPlaying: false }); }
      else { await player.play(); set({ isPlaying: true }); }
    },

    nextTrack: async () => {
      const { queue, currentIndex, repeat, shuffle } = get();
      if (!queue.length) return;
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
      const { queue, currentIndex, position } = get();
      if (position > 3) { await player.seekTo(0); return; }
      const prevIdx = Math.max(0, currentIndex - 1);
      if (queue[prevIdx]) await get().playTrack(queue[prevIdx], queue);
    },

    seekTo: async (s) => { await player.seekTo(s); set({ position: s }); },

    setRepeat: (r) => set({ repeat: r }),
    toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

    setVolume: async (v) => { await player.setVolume(v); set({ volume: v }); },

    _onStatus: (s) => {
      const { sponsorSegments, _skipGuard, sleepTimerEnd, lyrics } = get();
      set({
        isPlaying: s.isPlaying,
        position: s.position,
        duration: s.duration,
        isLoading: s.isLoading,
        currentLyricIndex: lyrics.length ? getCurrentLyricIndex(lyrics, s.position) : 0,
      });

      if (s.isPlaying && !_skipGuard && sponsorSegments.length) {
        for (const [start, end] of sponsorSegments) {
          if (s.position >= start - 0.5 && s.position < end) {
            set({ _skipGuard: true });
            player.seekTo(end).then(() => set({ _skipGuard: false }));
            break;
          }
        }
      }

      if (sleepTimerEnd && Date.now() >= sleepTimerEnd) {
        player.pause();
        set({ isPlaying: false, sleepTimerEnd: null });
      }
    },

    _onTrackEnd: () => {
      const { repeat } = get();
      if (repeat === 'one') { player.seekTo(0).then(() => player.play()); return; }
      get().nextTrack();
    },
  } as Store;
});

export const useColors = () => useStore((s) => s.colors);
