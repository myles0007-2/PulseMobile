import { Track } from '../types';
import { downloadManager } from './downloadManager';

export interface BatchDownloadStats {
  total: number;
  queued: number;
  completed: number;
  failed: number;
  inProgress: number;
}

export async function batchQueueDownloads(
  tracks: Track[],
  onProgress?: (stats: BatchDownloadStats) => void
): Promise<BatchDownloadStats> {
  const stats: BatchDownloadStats = {
    total: tracks.length,
    queued: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
  };

  // Get current tasks to check what's already queued
  const existingTasks = downloadManager.getAllTasks();
  const alreadyQueued = new Set(
    existingTasks
      .filter((t) => ['queued', 'downloading', 'completed'].includes(t.status))
      .map((t) => t.track.id)
  );

  for (const track of tracks) {
    if (!alreadyQueued.has(track.id)) {
      try {
        downloadManager.queueDownload(track);
        stats.queued++;
        alreadyQueued.add(track.id);
      } catch (e) {
        console.error(`Failed to queue ${track.id}:`, e);
        stats.failed++;
      }
    }
    onProgress?.(stats);
  }

  return stats;
}

export function getBatchDownloadStats(trackIds: string[]): BatchDownloadStats {
  const allTasks = downloadManager.getAllTasks();
  const trackIdSet = new Set(trackIds);

  const stats: BatchDownloadStats = {
    total: trackIds.length,
    queued: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
  };

  for (const task of allTasks) {
    if (trackIdSet.has(task.track.id)) {
      if (task.status === 'queued') stats.queued++;
      if (task.status === 'downloading') stats.inProgress++;
      if (task.status === 'completed') stats.completed++;
      if (task.status === 'failed') stats.failed++;
    }
  }

  return stats;
}
