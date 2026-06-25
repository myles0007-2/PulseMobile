/**
 * Podcast Manager (Phase 5)
 *
 * Manages podcast subscriptions, episode fetching, and playback.
 * Uses iTunes API for discovery + RSS parsing for episodes.
 */

import { fetchPodcast, episodeToTrack } from './podcastService';
import { Podcast, searchPodcasts, getTrendingPodcasts } from './itunesAPI';

export interface PodcastSubscription {
  id: string;
  title: string;
  artist: string;
  feedUrl: string;
  artworkUrl: string;
  subscribedAt: number;
  episodeCount: number;
  description?: string;
}

class PodcastManager {
  private subscriptions: Map<string, PodcastSubscription> = new Map();
  private episodeCache: Map<string, any[]> = new Map();

  /**
   * Search for podcasts via iTunes
   */
  async searchPodcasts(query: string): Promise<Podcast[]> {
    return searchPodcasts(query);
  }

  /**
   * Get trending podcasts
   */
  async getTrending(): Promise<Podcast[]> {
    return getTrendingPodcasts();
  }

  /**
   * Subscribe to a podcast
   */
  addSubscription(podcast: Podcast): void {
    const sub: PodcastSubscription = {
      id: podcast.id,
      title: podcast.title,
      artist: podcast.artist,
      feedUrl: podcast.feedUrl,
      artworkUrl: podcast.artworkUrl,
      subscribedAt: Date.now(),
      episodeCount: podcast.episodeCount,
    };
    this.subscriptions.set(podcast.id, sub);
  }

  /**
   * Unsubscribe from a podcast
   */
  removeSubscription(podcastId: string): void {
    this.subscriptions.delete(podcastId);
    this.episodeCache.delete(podcastId);
  }

  /**
   * Get all subscriptions
   */
  getSubscriptions(): PodcastSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Fetch episodes for a podcast (via RSS)
   */
  async fetchEpisodes(feedUrl: string): Promise<any[]> {
    try {
      const podcast = await fetchPodcast(feedUrl);
      return podcast.episodes || [];
    } catch (error) {
      console.error('Failed to fetch podcast episodes:', error);
      return [];
    }
  }

  /**
   * Cache episodes for offline access
   */
  cacheEpisodes(podcastId: string, episodes: any[]): void {
    this.episodeCache.set(podcastId, episodes);
  }

  /**
   * Get cached episodes
   */
  getCachedEpisodes(podcastId: string): any[] {
    return this.episodeCache.get(podcastId) || [];
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.episodeCache.clear();
  }
}

export const podcastManager = new PodcastManager();
