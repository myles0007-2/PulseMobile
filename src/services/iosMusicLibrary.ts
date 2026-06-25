import { NativeModules, Platform } from 'react-native';

// CRASH FIX: Native module is disabled (file missing from build)
// The native iTunes integration was causing build failures.
// Users can import music via Documents/3uTools instead.
const MusicLibraryModule = null;

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
  // Native iTunes module is disabled
  return false;
}

export async function requestMusicPermission(): Promise<boolean> {
  console.log('[MusicLibrary] iTunes module disabled—users can import via Documents folder instead');
  return false;
}

export async function getItunesTracks(): Promise<NativeMusicTrack[]> {
  console.log('[MusicLibrary] iTunes module disabled—returning empty list');
  return [];
}

// Fetch artwork for a single track by ID — call lazily, not in bulk.
export async function getTrackArtwork(trackId: string): Promise<string | null> {
  return null;
}
