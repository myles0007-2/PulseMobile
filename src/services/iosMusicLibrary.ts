import { NativeModules, Platform } from 'react-native';

const MusicLibraryModule = NativeModules?.MusicLibraryModule || null;

export interface NativeMusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  uri: string;
  artworkBase64?: string;
}

export function isAvailable(): boolean {
  return Platform.OS === 'ios' && !!MusicLibraryModule;
}

export async function requestMusicPermission(): Promise<boolean> {
  if (!isAvailable()) return false;
  try { return await MusicLibraryModule.requestPermission(); } catch { return false; }
}

export async function getItunesTracks(): Promise<NativeMusicTrack[]> {
  console.log('[MusicLibrary] getItunesTracks called');
  if (!isAvailable()) {
    console.log('[MusicLibrary] Module not available on this platform');
    return [];
  }
  try {
    console.log('[MusicLibrary] Calling native getTracks...');
    if (!MusicLibraryModule || typeof MusicLibraryModule.getTracks !== 'function') {
      console.warn('[MusicLibrary] getTracks method not available');
      return [];
    }
    const tracks: NativeMusicTrack[] = await MusicLibraryModule.getTracks();
    console.log(`[MusicLibrary] Native returned ${tracks?.length ?? 0} tracks`);
    if (!Array.isArray(tracks)) {
      console.warn('[MusicLibrary] getTracks returned non-array:', typeof tracks);
      return [];
    }
    const filtered = tracks.filter((t) => t && t.uri && t.uri.length > 0);
    console.log(`[MusicLibrary] Filtered to ${filtered.length} tracks with valid URIs`);
    return filtered;
  } catch (e) {
    console.error('[MusicLibrary] getTracks failed:', e instanceof Error ? e.stack : String(e));
    return [];
  }
}

// Fetch artwork for a single track by ID — call lazily, not in bulk.
export async function getTrackArtwork(trackId: string): Promise<string | null> {
  if (!isAvailable()) return null;
  try {
    const b64: string | null = await MusicLibraryModule.getArtwork(trackId);
    return b64 ? `data:image/jpeg;base64,${b64}` : null;
  } catch { return null; }
}
