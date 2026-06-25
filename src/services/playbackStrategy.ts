import * as FileSystem from 'expo-file-system';
import { Track } from '../types';
import { downloadManager } from './downloadManager';
import { cacheManager } from './cacheManager';
import { searchYoutube, youtubeResultToTrack } from './youtubeService';

const DOWNLOADS_DIR = `${FileSystem.documentDirectory}PulseMusic/downloads`;

export interface PlaybackSource {
  uri: string;
  source: 'local' | 'youtube' | 'piped' | 'podcast';
}

/**
 * Playback strategy: three-tier resolution
 * 1. Local cached file (offline)
 * 2. YouTube/Invidious stream (online)
 * 3. Piped fallback (online)
 */
export async function resolvePlayableUrl(track: Track): Promise<PlaybackSource | null> {
  try {
    // Tier 1: Local cached file (downloads or cache)
    const localPath = await getLocalFile(track.id);
    if (localPath) {
      return { uri: localPath, source: 'local' };
    }

    // Tier 2 & 3: Online streams (delegated to existing services)
    // Note: This returns the track URI as-is; actual resolution happens in audioPlayer
    if (track.source === 'youtube' && track.uri.startsWith('yt::')) {
      // YouTube video ID stored as yt::videoId
      // Let the existing youtubeService handle Invidious → Piped fallback
      return { uri: track.uri, source: 'youtube' };
    }

    // For podcast/other sources, return as-is
    if (track.uri && !track.uri.startsWith('yt::')) {
      return { uri: track.uri, source: track.source };
    }

    return null;
  } catch (e) {
    console.error('Failed to resolve playable URL:', e);
    return null;
  }
}

/**
 * Check if track is available locally (downloaded or cached)
 */
async function getLocalFile(trackId: string): Promise<string | null> {
  try {
    // Check downloads folder first (user-initiated downloads)
    const downloadedPath = await downloadManager.getDownloadedFilePath(trackId);
    if (downloadedPath) {
      return downloadedPath;
    }

    // Check cache folder (auto-cached files)
    const cachedPath = await cacheManager.getCachedFilePath(trackId);
    if (cachedPath) {
      return cachedPath;
    }

    return null;
  } catch (e) {
    console.error('Failed to get local file:', e);
    return null;
  }
}

/**
 * Check if track can be played offline (is cached locally)
 */
export async function isOfflineAvailable(track: Track): Promise<boolean> {
  const localFile = await getLocalFile(track.id);
  return localFile !== null;
}
