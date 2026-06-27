import { NativeModules, Platform } from 'react-native';

// CRASH FIX: Completely defer native module access
// The MusicLibraryModule is optional - if it's not available, app works fine
let MusicLibraryModule: any = null;
let moduleLoadAttempted = false;

function ensureModuleLoaded() {
  if (moduleLoadAttempted) return;
  moduleLoadAttempted = true;

  // CRITICAL: Do not access NativeModules at module load time
  // Schedule this for later to avoid bridge initialization crashes
  setTimeout(() => {
    try {
      const mod = NativeModules?.MusicLibraryModule;
      if (mod && typeof mod === 'object') {
        MusicLibraryModule = mod;
        console.log('[MusicLibrary] Native module loaded');
      }
    } catch (e) {
      console.warn('[MusicLibrary] Module load error:', e instanceof Error ? e.message : String(e));
    }
  }, 100);
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
