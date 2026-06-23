import { NativeModules, Platform } from 'react-native';

const { MusicLibraryModule } = NativeModules;

export interface NativeMusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  uri: string;
}

export function isAvailable(): boolean {
  return Platform.OS === 'ios' && !!MusicLibraryModule;
}

export async function requestMusicPermission(): Promise<boolean> {
  if (!isAvailable()) return false;
  try { return await MusicLibraryModule.requestPermission(); } catch { return false; }
}

export async function getItunesTracks(): Promise<NativeMusicTrack[]> {
  if (!isAvailable()) return [];
  try {
    const tracks: NativeMusicTrack[] = await MusicLibraryModule.getTracks();
    return tracks.filter((t) => t.uri && t.uri.length > 0);
  } catch { return []; }
}

// Fetch artwork for a single track by ID — call lazily, not in bulk.
export async function getTrackArtwork(trackId: string): Promise<string | null> {
  if (!isAvailable()) return null;
  try {
    const b64: string | null = await MusicLibraryModule.getArtwork(trackId);
    return b64 ? `data:image/jpeg;base64,${b64}` : null;
  } catch { return null; }
}
