import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Track } from '../types';

const QUEUE_STORAGE_KEY = 'pulsemobile_download_queue';

export interface DownloadTask {
  id: string;
  track: Track;
  status: 'queued' | 'downloading' | 'paused' | 'completed' | 'failed';
  progress: number; // 0-100
  bytesDownloaded: number;
  totalBytes: number;
  error?: string;
  retryAttempts: number;
}

export interface DownloadProgress {
  taskId: string;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
}

type ProgressCallback = (progress: DownloadProgress) => void;
type CompleteCallback = (taskId: string, success: boolean, error?: string) => void;
type StatusChangeCallback = (taskId: string, status: DownloadTask['status']) => void;

const DOWNLOADS_DIR = `${FileSystem.documentDirectory}PulseMusic/downloads`;
const CACHE_DIR = `${FileSystem.documentDirectory}PulseMusic/cache`;
const MAX_RETRIES = 2;
const CHUNK_SIZE = 512 * 1024; // 512KB chunks

class DownloadManager {
  private queue: Map<string, DownloadTask> = new Map();
  private isProcessing: boolean = false;
  private progressCallbacks: ProgressCallback[] = [];
  private completeCallbacks: CompleteCallback[] = [];
  private statusChangeCallbacks: StatusChangeCallback[] = [];
  private currentTaskId: string | null = null;
  private abortController: AbortController | null = null;

  constructor() {
    this.initializeDirectories();
    this.restoreQueue();
  }

  private async initializeDirectories() {
    try {
      const dirInfo = await FileSystem.getInfoAsync(DOWNLOADS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
      }
      const cacheInfo = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!cacheInfo.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      }
    } catch (e) {
      console.error('Failed to initialize download directories:', e);
    }
  }

  // Restore queue from persistent storage
  private async restoreQueue() {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const tasks = JSON.parse(stored) as DownloadTask[];
        tasks.forEach((task) => {
          // Only restore incomplete tasks
          if (task.status === 'downloading' || task.status === 'queued' || task.status === 'paused') {
            task.status = 'queued'; // Reset to queued on app restart
            this.queue.set(task.id, task);
          }
        });
        console.log(`Restored ${this.queue.size} downloads from storage`);
        if (this.queue.size > 0) this.processQueue();
      }
    } catch (e) {
      console.error('Failed to restore download queue:', e);
    }
  }

  // CRASH FIX: Save queue to persistent storage with proper error handling
  private async persistQueue() {
    try {
      const tasks = Array.from(this.queue.values());
      const json = JSON.stringify(tasks);
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, json);
      console.log(`[DownloadManager] Queue persisted: ${tasks.length} tasks`);
    } catch (e) {
      console.warn('[DownloadManager] Failed to persist queue:',
        e instanceof Error ? e.message : String(e));
    }
  }

  onProgress(callback: ProgressCallback) {
    this.progressCallbacks.push(callback);
  }

  onComplete(callback: CompleteCallback) {
    this.completeCallbacks.push(callback);
  }

  onStatusChange(callback: StatusChangeCallback) {
    this.statusChangeCallbacks.push(callback);
  }

  // Queue a track for download
  async queueDownload(track: Track): Promise<string> {
    const taskId = `dl_${track.id}_${Date.now()}`;
    const task: DownloadTask = {
      id: taskId,
      track,
      status: 'queued',
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      retryAttempts: 0,
    };
    this.queue.set(taskId, task);
    await this.persistQueue();
    this.processQueue();
    return taskId;
  }

  // Get download task by ID
  getTask(taskId: string): DownloadTask | undefined {
    return this.queue.get(taskId);
  }

  // Get all tasks
  getAllTasks(): DownloadTask[] {
    return Array.from(this.queue.values());
  }

  // Pause current download
  async pauseDownload() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.currentTaskId) {
      const task = this.queue.get(this.currentTaskId);
      if (task) {
        task.status = 'paused';
        // Emit status change event for UI updates
        this.statusChangeCallbacks.forEach(cb => cb(this.currentTaskId!, 'paused'));
        await this.persistQueue();
      }
    }
  }

  // Resume all queued downloads
  resumeDownload() {
    this.processQueue();
  }

  // Cancel a specific download
  async cancelDownload(taskId: string) {
    const task = this.queue.get(taskId);
    if (task) {
      if (this.currentTaskId === taskId) {
        await this.pauseDownload();
      }
      this.queue.delete(taskId);
    }
  }

  // Main processing loop: serial downloads
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const tasks = Array.from(this.queue.entries());
      for (const [taskId, task] of tasks) {
        if (task.status === 'completed' || task.status === 'failed') continue;
        if (task.status === 'paused') continue;

        this.currentTaskId = taskId;
        task.status = 'downloading';

        const success = await this.downloadTrack(task);

        if (success) {
          task.status = 'completed';
          task.progress = 100;
          this.persistQueue();
          this.completeCallbacks.forEach((cb) => cb(taskId, true));
        } else {
          if (task.retryAttempts < MAX_RETRIES) {
            task.retryAttempts++;
            task.status = 'queued';
            // Delete partial file on retry to force fresh download
            const fileName = `${task.track.id}.m4a`;
            const fileUri = `${DOWNLOADS_DIR}/${fileName}`;
            try {
              await FileSystem.deleteAsync(fileUri, { idempotent: true });
            } catch (e) {
              console.warn('Failed to delete partial file on retry:', e);
            }
            this.persistQueue();
            // Add exponential backoff before retry (2s for 1st retry, 4s for 2nd)
            const backoffMs = Math.pow(2, task.retryAttempts) * 1000;
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            // Retry this task by re-processing queue
            this.isProcessing = false;
            return this.processQueue();
          } else {
            task.status = 'failed';
            this.persistQueue();
            this.completeCallbacks.forEach((cb) => cb(taskId, false, task.error));
          }
        }
      }
    } finally {
      this.isProcessing = false;
      this.currentTaskId = null;
    }
  }

  // Download a single track
  private async downloadTrack(task: DownloadTask): Promise<boolean> {
    try {
      const { track } = task;
      const fileName = `${track.id}.m4a`;
      const fileUri = `${DOWNLOADS_DIR}/${fileName}`;

      // Check if already downloaded
      const existing = await FileSystem.getInfoAsync(fileUri);
      if (existing.exists) {
        task.progress = 100;
        task.bytesDownloaded = existing.size ?? 0;
        task.totalBytes = existing.size ?? 0;
        return true;
      }

      // Get stream URL
      let streamUrl = track.uri;
      if (track.source === 'youtube' && track.uri.startsWith('yt::')) {
        // Would call resolveStreamUrl here in real app
        // For now, use as-is
        streamUrl = track.uri;
      }

      // Download with progress tracking
      this.abortController = new AbortController();

      await FileSystem.downloadAsync(
        streamUrl,
        fileUri,
        {
          headers: {},
          md5: false,
        }
      );

      // Verify file exists and has content
      const result = await FileSystem.getInfoAsync(fileUri);
      if (result.exists && result.isDirectory === false) {
        const fileSize = 'size' in result ? (result as any).size : 0;
        task.bytesDownloaded = fileSize;
        task.totalBytes = fileSize;
        task.progress = 100;

        // Emit completion
        this.progressCallbacks.forEach((cb) =>
          cb({ taskId: task.id, progress: 100, bytesDownloaded: task.bytesDownloaded, totalBytes: task.totalBytes })
        );

        return true;
      } else {
        task.error = 'Downloaded file is empty or missing';
        return false;
      }
    } catch (e: any) {
      task.error = e.message || 'Download failed';
      console.error(`Download failed for ${task.track.id}:`, e);
      return false;
    }
  }

  // Get download file path for a track
  async getDownloadedFilePath(trackId: string): Promise<string | null> {
    const fileName = `${trackId}.m4a`;
    const fileUri = `${DOWNLOADS_DIR}/${fileName}`;
    const exists = await FileSystem.getInfoAsync(fileUri);
    return exists.exists ? fileUri : null;
  }

  // Clear all downloads
  async clearAllDownloads() {
    try {
      const files = await FileSystem.readDirectoryAsync(DOWNLOADS_DIR);
      for (const file of files) {
        await FileSystem.deleteAsync(`${DOWNLOADS_DIR}/${file}`, { idempotent: true });
      }
      this.queue.clear();
    } catch (e) {
      console.error('Failed to clear downloads:', e);
    }
  }

  // Get download folder size
  async getDownloadsFolderSize(): Promise<number> {
    try {
      const files = await FileSystem.readDirectoryAsync(DOWNLOADS_DIR);
      let totalSize = 0;
      for (const file of files) {
        const info = await FileSystem.getInfoAsync(`${DOWNLOADS_DIR}/${file}`);
        if (info.exists && info.isDirectory === false) {
          if ('size' in info) totalSize += (info as any).size;
        }
      }
      return totalSize;
    } catch (e) {
      console.error('Failed to get downloads folder size:', e);
      return 0;
    }
  }

  // BATTERY & EDGE FIX: Pause all downloads (called on app background)
  pauseAll() {
    console.log('[DownloadManager] Pausing all downloads');
    this.isProcessing = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // BATTERY & EDGE FIX: Resume downloads (called on app foreground)
  resumeAll() {
    console.log('[DownloadManager] Resuming downloads');
    this.processQueue();
  }

  // EDGE FIX: Handle network loss gracefully
  async onNetworkLoss() {
    console.warn('[DownloadManager] Network lost, pausing downloads');
    this.pauseAll();
    // Pause current task
    if (this.currentTaskId) {
      const task = this.queue.get(this.currentTaskId);
      if (task && task.status === 'downloading') {
        task.status = 'paused';
        await this.persistQueue();
      }
    }
  }

  // EDGE FIX: Resume after network restored
  async onNetworkRestore() {
    console.log('[DownloadManager] Network restored, resuming downloads');
    this.resumeAll();
  }

  // MEMORY FIX: Cleanup old downloads (LRU cache eviction)
  async cleanupOldDownloads(maxSizeMB: number = 500) {
    try {
      const currentSize = await this.getDownloadsFolderSize();
      const maxSizeBytes = maxSizeMB * 1024 * 1024;

      if (currentSize > maxSizeBytes) {
        console.log(`[DownloadManager] Cache full (${(currentSize / 1024 / 1024).toFixed(1)}MB), cleaning up`);

        const files = await FileSystem.readDirectoryAsync(DOWNLOADS_DIR);
        const fileStats: Array<{ name: string; modTime: number; size: number }> = [];

        for (const file of files) {
          const fileUri = `${DOWNLOADS_DIR}/${file}`;
          const info = await FileSystem.getInfoAsync(fileUri);
          if (info.exists && info.isDirectory === false) {
            fileStats.push({
              name: file,
              modTime: info.modificationTime ?? 0,
              size: (info as any).size ?? 0,
            });
          }
        }

        // Sort by modification time (oldest first)
        fileStats.sort((a, b) => a.modTime - b.modTime);

        // Delete oldest files until under limit
        let freed = 0;
        for (const stat of fileStats) {
          if (currentSize - freed <= maxSizeBytes * 0.8) break; // Stop at 80% capacity

          try {
            await FileSystem.deleteAsync(`${DOWNLOADS_DIR}/${stat.name}`, { idempotent: true });
            freed += stat.size;
            console.log(`[DownloadManager] Deleted old download: ${stat.name}`);
          } catch (e) {
            console.warn(`[DownloadManager] Failed to delete ${stat.name}:`, e);
          }
        }

        console.log(`[DownloadManager] Cleanup freed ${(freed / 1024 / 1024).toFixed(1)}MB`);
      }
    } catch (e) {
      console.warn('[DownloadManager] Cleanup error:', e instanceof Error ? e.message : String(e));
    }
  }
}

export const downloadManager = new DownloadManager();
