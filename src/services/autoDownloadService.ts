import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Track } from '../types';
import { downloadManager } from './downloadManager';

let isMonitoring = false;
let currentNetworkState: NetInfoState | null = null;

export async function startAutoDownloadMonitor(
  getLikedSongs: () => Track[],
  getAutoDownloadEnabled: () => boolean,
  getAutoDownloadLikedSongs: () => boolean,
  getWifiOnly: () => boolean
) {
  if (isMonitoring) return;
  isMonitoring = true;

  // Subscribe to network state changes (await state check before queuing)
  const unsubscribe = NetInfo.addEventListener((state) => {
    currentNetworkState = state;
    checkAndAutoDownload(getLikedSongs, getAutoDownloadEnabled, getAutoDownloadLikedSongs, getWifiOnly);
  });

  // Check once on start (await network state fetch before queuing)
  try {
    const initialState = await NetInfo.fetch();
    currentNetworkState = initialState;
    await checkAndAutoDownload(getLikedSongs, getAutoDownloadEnabled, getAutoDownloadLikedSongs, getWifiOnly);
  } catch (e) {
    console.warn('Auto-download monitor startup failed:', e);
  }

  return unsubscribe;
}

async function checkAndAutoDownload(
  getLikedSongs: () => Track[],
  getAutoDownloadEnabled: () => boolean,
  getAutoDownloadLikedSongs: () => boolean,
  getWifiOnly: () => boolean
) {
  // Await network state verification before proceeding
  if (!currentNetworkState) {
    try {
      currentNetworkState = await NetInfo.fetch();
    } catch (e) {
      console.warn('Failed to fetch network state:', e);
      return;
    }
  }

  if (!currentNetworkState?.isConnected) return;
  if (!getAutoDownloadEnabled()) return;
  if (!getAutoDownloadLikedSongs()) return;

  // Check if WiFi-only mode is enabled
  if (getWifiOnly() && currentNetworkState.type !== 'wifi') {
    return;
  }

  // Get liked songs and auto-download
  const likedSongs = getLikedSongs();
  for (const track of likedSongs) {
    // Only queue if not already queued/completed
    const existingTasks = downloadManager.getAllTasks();
    if (!existingTasks.find((t) => t.track.id === track.id && (t.status === 'completed' || t.status === 'downloading' || t.status === 'queued'))) {
      downloadManager.queueDownload(track);
    }
  }
}

export function stopAutoDownloadMonitor(unsubscribe?: () => void) {
  if (unsubscribe) {
    unsubscribe();
  }
  isMonitoring = false;
}
