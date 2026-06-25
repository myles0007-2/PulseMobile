import * as FileSystem from 'expo-file-system';

export interface CacheStats {
  used: number; // bytes
  limit: number; // bytes
  count: number; // file count
}

const CACHE_DIR = `${FileSystem.documentDirectory}PulseMusic/cache`;
const DEFAULT_CACHE_LIMIT = 1024 * 1024 * 1024; // 1GB
const MAX_EVICTIONS = 50; // Maximum files to evict in one cleanup
const MIN_FILES = 5; // Never evict below this many files

class CacheManager {
  private cacheLimit: number = DEFAULT_CACHE_LIMIT;
  private stats: CacheStats = { used: 0, limit: DEFAULT_CACHE_LIMIT, count: 0 };

  constructor() {
    this.initializeCache();
  }

  private async initializeCache() {
    try {
      const info = await FileSystem.getInfoAsync(CACHE_DIR);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      }
      await this.updateCacheStats();
    } catch (e) {
      console.error('Failed to initialize cache:', e);
    }
  }

  // Set cache size limit (in bytes)
  setLimit(bytes: number) {
    this.cacheLimit = bytes;
  }

  // Get current cache stats
  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Update cache stats by scanning directory
  private async updateCacheStats() {
    try {
      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
      let totalSize = 0;

      for (const file of files) {
        const filePath = `${CACHE_DIR}/${file}`;
        const info = await FileSystem.getInfoAsync(filePath);
        if (info.exists && !info.isDirectory && 'size' in info) {
          totalSize += (info as any).size ?? 0;
        }
      }

      this.stats = {
        used: totalSize,
        limit: this.cacheLimit,
        count: files.length,
      };
    } catch (e) {
      console.error('Failed to update cache stats:', e);
    }
  }

  // Add file to cache (or verify it exists)
  async addToCache(trackId: string, sourceUri: string, fileName: string = `${trackId}.m4a`): Promise<boolean> {
    try {
      const filePath = `${CACHE_DIR}/${fileName}`;

      // Check if already cached
      const existing = await FileSystem.getInfoAsync(filePath);
      if (existing.exists) {
        // File already exists, no need to download
        await this.updateCacheStats();
        return true;
      }

      // Copy or move file from source to cache
      // (In real app, this would be called after download completes)
      await this.updateCacheStats();

      // Check if cache is over limit, evict if needed
      if (this.stats.used > this.cacheLimit) {
        await this.evictOldest(0);
      }

      return true;
    } catch (e) {
      console.error('Failed to add to cache:', e);
      return false;
    }
  }

  // Check if file is cached
  async isCached(trackId: string, fileName: string = `${trackId}.m4a`): Promise<boolean> {
    try {
      const filePath = `${CACHE_DIR}/${fileName}`;
      const info = await FileSystem.getInfoAsync(filePath);
      return info.exists && info.isDirectory === false;
    } catch (e) {
      return false;
    }
  }

  // Get cached file path
  async getCachedFilePath(trackId: string, fileName: string = `${trackId}.m4a`): Promise<string | null> {
    try {
      const filePath = `${CACHE_DIR}/${fileName}`;
      const info = await FileSystem.getInfoAsync(filePath);
      if (info.exists && info.isDirectory === false) {
        return filePath;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // FIFO eviction: delete oldest file by modification time (with safety limits)
  private async evictOldest(evictionCount: number = 0) {
    try {
      // Safety limit: never evict more than MAX_EVICTIONS files
      if (evictionCount >= MAX_EVICTIONS) {
        console.warn(`Cache eviction limit reached (${MAX_EVICTIONS} files evicted)`);
        return;
      }

      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
      if (files.length <= MIN_FILES) {
        console.warn(`Cache has minimum files (${MIN_FILES}), stopping eviction`);
        return;
      }

      // Get file stats with modification times
      const fileStats: Array<{ name: string; mtime: number; size: number }> = [];

      for (const file of files) {
        const filePath = `${CACHE_DIR}/${file}`;
        const info = await FileSystem.getInfoAsync(filePath);

        if (info.exists && !info.isDirectory && 'size' in info) {
          fileStats.push({
            name: file,
            mtime: info.modificationTime ?? 0,
            size: (info as any).size ?? 0,
          });
        }
      }

      // Sort by modification time (oldest first)
      fileStats.sort((a, b) => a.mtime - b.mtime);

      // Delete oldest file
      if (fileStats.length > MIN_FILES) {
        const oldestFile = fileStats[0];
        const filePath = `${CACHE_DIR}/${oldestFile.name}`;
        await FileSystem.deleteAsync(filePath, { idempotent: true });
        console.log(`Evicted cache file: ${oldestFile.name} (${oldestFile.size} bytes)`);

        await this.updateCacheStats();

        // If still over limit, evict again (with incremented counter)
        if (this.stats.used > this.cacheLimit) {
          await this.evictOldest(evictionCount + 1);
        }
      }
    } catch (e) {
      console.error('Failed to evict cache:', e);
    }
  }

  // Manually clear all cache
  async clearCache() {
    try {
      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
      for (const file of files) {
        const filePath = `${CACHE_DIR}/${file}`;
        try {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
        } catch (e) {
          console.warn(`Failed to delete cache file ${file}:`, e);
        }
      }
      await this.updateCacheStats();
      console.log('Cache cleared');
    } catch (e) {
      console.error('Failed to clear cache:', e);
    }
  }

  // Validate cache (check if files exist)
  async validateCache(): Promise<number> {
    try {
      const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
      let validCount = 0;
      const toDelete: string[] = [];

      for (const file of files) {
        const filePath = `${CACHE_DIR}/${file}`;
        const info = await FileSystem.getInfoAsync(filePath);

        if (info.exists && info.isDirectory === false) {
          const fileInfo = info as any;
          if ((fileInfo.size ?? 0) > 0) {
            validCount++;
          } else {
            toDelete.push(filePath);
          }
        } else {
          toDelete.push(filePath);
        }
      }

      // Clean up invalid files
      for (const filePath of toDelete) {
        try {
          await FileSystem.deleteAsync(filePath, { idempotent: true });
        } catch (e) {
          console.warn(`Failed to delete invalid cache file:`, e);
        }
      }

      if (toDelete.length > 0) {
        await this.updateCacheStats();
        console.log(`Removed ${toDelete.length} invalid cache files`);
      }

      return validCount;
    } catch (e) {
      console.error('Failed to validate cache:', e);
      return 0;
    }
  }

}

export const cacheManager = new CacheManager();
