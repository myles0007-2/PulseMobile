import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, Album } from '../types';
import { getItunesTracks, NativeMusicTrack } from './iosMusicLibrary';

const CACHE_KEY = 'pulse_library_v3';
const AUDIO_EXT = /\.(mp3|m4a|m4p|aac|flac|wav|ogg|opus|aiff|alac|caf)$/i;

// Improved filename parser: strips track numbers, handles Artist - Title format
function parseFilename(filename: string): { title: string; artist: string; album: string } {
  let name = filename.replace(/\.[^.]+$/, '');
  // Strip leading track number: "01 ", "01 - ", "01. "
  name = name.replace(/^\d{1,3}[\s.\-]+/, '');
  const dashIdx = name.indexOf(' - ');
  if (dashIdx > 0) {
    return {
      artist: name.slice(0, dashIdx).trim(),
      title: name.slice(dashIdx + 3).trim(),
      album: 'Unknown Album',
    };
  }
  const parenMatch = name.match(/^(.+)\s+\(([^)]+)\)$/);
  if (parenMatch) {
    return { title: parenMatch[1].trim(), artist: parenMatch[2].trim(), album: 'Unknown Album' };
  }
  return { title: name.trim(), artist: 'Unknown Artist', album: 'Unknown Album' };
}

// ── Permission no longer needed for iTunes access ─────────────────
export async function requestLibraryPermission(): Promise<boolean> {
  // The native MPMediaLibrary permission is requested separately via iosMusicLibrary.ts
  // Documents scanning never needs permission
  return true;
}

export async function scanLibrary(
  onProgress?: (loaded: number, total: number) => void
): Promise<{ tracks: Track[]; albums: Album[] }> {
  const allTracks: Track[] = [];
  const albumMap: Record<string, Album> = {};

  // ── 1. iTunes / Music app library via MPMediaLibrary (primary source) ──
  let itunesTracks: NativeMusicTrack[] = [];
  try {
    itunesTracks = await getItunesTracks();
  } catch (e) {
    console.warn('iTunes library scan failed, using Documents only:', e);
  }

  for (let i = 0; i < itunesTracks.length; i++) {
    const native = itunesTracks[i];
    onProgress?.(i, itunesTracks.length);

    const track: Track = {
      id: native.id,
      title: native.title,
      artist: native.artist,
      album: native.album,
      duration: native.duration,
      uri: native.uri,
      source: 'local',
    };

    // Use embedded artwork if available (comes as base64 from native)
    if (native.artworkBase64) {
      track.artwork = `data:image/jpeg;base64,${native.artworkBase64}`;
    }

    allTracks.push(track);

    const albumKey = `${track.artist}::${track.album}`;
    if (!albumMap[albumKey]) {
      albumMap[albumKey] = {
        id: albumKey,
        title: track.album,
        artist: track.artist,
        trackIds: [],
        artwork: track.artwork,
      };
    }
    albumMap[albumKey].trackIds.push(track.id);
    if (track.artwork && !albumMap[albumKey].artwork) {
      albumMap[albumKey].artwork = track.artwork;
    }
  }

  // ── 2. Documents directory (iTunes File Sharing / 3uTools File Manager) ──
  const docsDir = FileSystem.documentDirectory;
  if (!docsDir) {
    console.warn('Documents directory not available on this device, skipping file scan');
    const albums = Object.values(albumMap);
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ tracks: allTracks, albums, ts: Date.now() }));
    return { tracks: allTracks, albums };
  }
  const docTracks = await scanDirRecursive(docsDir, docsDir);

  for (const doc of docTracks) {
    // Skip duplicates (same title+artist might come from both sources)
    if (allTracks.some((t) => t.title === doc.title && t.artist === doc.artist)) continue;
    allTracks.push(doc);

    const albumKey = `${doc.artist}::${doc.album}`;
    if (!albumMap[albumKey]) {
      albumMap[albumKey] = { id: albumKey, title: doc.album, artist: doc.artist, trackIds: [] };
    }
    albumMap[albumKey].trackIds.push(doc.id);
  }

  const albums = Object.values(albumMap);
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ tracks: allTracks, albums, ts: Date.now() }));
  return { tracks: allTracks, albums };
}

// Recursively scan a directory for audio files (Documents folder + subfolders)
async function scanDirRecursive(dir: string, rootDir: string, depth = 0): Promise<Track[]> {
  if (depth > 5) return [];
  const tracks: Track[] = [];
  try {
    const contents = await FileSystem.readDirectoryAsync(dir);
    for (const name of contents) {
      const fullPath = (dir.endsWith('/') ? dir : dir + '/') + name;
      if (AUDIO_EXT.test(name)) {
        const parsed = parseFilename(name);
        const folderName = dir !== rootDir ? dir.split('/').filter(Boolean).pop() ?? '' : '';
        tracks.push({
          id: `doc::${fullPath}`,
          title: parsed.title,
          artist: parsed.artist,
          album: parsed.album !== 'Unknown Album' ? parsed.album : (folderName || 'Unknown Album'),
          duration: 0,
          uri: fullPath,
          source: 'local',
        });
      } else if (!name.startsWith('.')) {
        try {
          const info = await FileSystem.getInfoAsync(fullPath);
          if (info.isDirectory) {
            const sub = await scanDirRecursive(fullPath + '/', rootDir, depth + 1);
            tracks.push(...sub);
          }
        } catch (e) {
          console.warn(`Failed to scan subdirectory ${fullPath}:`, e);
        }
      }
    }
  } catch (e) {
    console.warn(`Library scan error in ${dir}:`, e);
  }
  return tracks;
}

export async function loadCachedLibrary(): Promise<{ tracks: Track[]; albums: Album[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.ts > 86_400_000) return null;
    return { tracks: data.tracks, albums: data.albums };
  } catch {
    return null;
  }
}

export async function clearLibraryCache() {
  await AsyncStorage.removeItem(CACHE_KEY);
}
