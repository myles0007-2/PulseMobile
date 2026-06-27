import { NativeModules, Platform } from 'react-native';

// CRASH FIX: Lazy-load native module to avoid initialization errors
// Accessing NativeModules at module load time can cause bridge crashes on iOS
let MusicLibraryModule: any = null;
let moduleLoadAttempted = false;

function ensureModuleLoaded() {
  if (moduleLoadAttempted) return;
  moduleLoadAttempted = true;
  try {
    MusicLibraryModule = NativeModules?.MusicLibraryModule || null;
    if (MusicLibraryModule) {
      console.log('[MusicLibrary] Native module available');
    }
  } catch (e) {
    console.warn('[MusicLibrary] Failed to load native module:', e instanceof Error ? e.message : String(e));
    MusicLibraryModule = null;
  }
}

export interface NativeMusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  uri: string;
  artworkBase64?: string;
}

export interface BatchResult {
  tracks: NativeMusicTrack[];
  total: number;
  offset: number;
  returned: number;
}

export function isAvailable(): boolean {
  ensureModuleLoaded();
  return Platform.OS === 'ios' && !!MusicLibraryModule;
}

export async function requestMusicPermission(): Promise<boolean> {
  ensureModuleLoaded();
  if (!isAvailable()) return false;
  try { return await MusicLibraryModule.requestPermission(); } catch { return false; }
}

// Load iTunes library in batches (ONLY on-demand via button, never at startup)
export async function getItunesTracksBatch(offset: number = 0, limit: number = 50): Promise<BatchResult> {
  ensureModuleLoaded();
  console.log(`[MusicLibrary] Loading batch: offset=${offset}, limit=${limit}`);
  if (!isAvailable()) {
    console.log('[MusicLibrary] Module not available on this platform');
    return { tracks: [], total: 0, offset, returned: 0 };
  }
  try {
    if (!MusicLibraryModule || typeof MusicLibraryModule.getTracksInBatches !== 'function') {
      console.warn('[MusicLibrary] getTracksInBatches method not available');
      return { tracks: [], total: 0, offset, returned: 0 };
    }
    const result = await MusicLibraryModule.getTracksInBatches(offset, limit);
    const filtered = (result.tracks as NativeMusicTrack[])
      .filter((t) => t && t.uri && t.uri.length > 0);

    console.log(`[MusicLibrary] Batch: returned=${filtered.length}/${result.total}`);
    return {
      tracks: filtered,
      total: result.total || 0,
      offset: result.offset || offset,
      returned: filtered.length
    };
  } catch (e) {
    console.error('[MusicLibrary] Batch load failed:', e instanceof Error ? e.message : String(e));
    return { tracks: [], total: 0, offset, returned: 0 };
  }
}

// Legacy fallback (loads all at once—use getItunesTracksBatch instead)
export async function getItunesTracks(): Promise<NativeMusicTrack[]> {
  const result = await getItunesTracksBatch(0, 10000);
  return result.tracks;
}

export async function getTrackArtwork(trackId: string): Promise<string | null> {
  ensureModuleLoaded();
  if (!isAvailable()) return null;
  try {
    const b64: string | null = await MusicLibraryModule.getArtwork(trackId);
    return b64 ? `data:image/jpeg;base64,${b64}` : null;
  } catch { return null; }
}
