/**
 * iTunes API Service for Podcast Discovery (Phase 5)
 *
 * Free, no-auth podcast discovery via iTunes Search API.
 * Returns podcast metadata + feed URLs for RSS parsing.
 */

import { YoutubeResult } from '../types';

const ITUNES_API = 'https://itunes.apple.com/search';
const RATE_LIMIT_MS = 300; // Min 300ms between requests
const REQUEST_TIMEOUT_MS = 8000;

let lastRequestTime = 0;

export interface Podcast {
  id: string;
  title: string;
  artist: string;
  description: string;
  artworkUrl: string;
  feedUrl: string;
  episodeCount: number;
}

function timedFetch(url: string, ms = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
}

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - lastRequestTime < RATE_LIMIT_MS) return false;
  lastRequestTime = now;
  return true;
}

/**
 * Search iTunes for podcasts
 */
export async function searchPodcasts(query: string): Promise<Podcast[]> {
  if (!checkRateLimit()) {
    throw new Error('Podcast search rate limited — please wait before searching again');
  }

  const encoded = encodeURIComponent(query);
  const url = `${ITUNES_API}?term=${encoded}&media=podcast&limit=25`;

  try {
    const res = await timedFetch(url);
    if (!res.ok) {
      throw new Error(`iTunes API returned ${res.status}`);
    }

    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results
      .filter((item: any) => item.feedUrl) // Must have RSS feed URL
      .map((item: any) => ({
        id: `podcast_${item.collectionId}`,
        title: item.collectionName || 'Unknown Podcast',
        artist: item.artistName || 'Unknown Artist',
        description: item.shortDescription || item.summary || '',
        artworkUrl: item.artworkUrl600 || item.artworkUrl100 || '',
        feedUrl: item.feedUrl,
        episodeCount: item.trackCount || 0,
      }))
      .slice(0, 20); // Cap at 20 results
  } catch (error) {
    console.error('iTunes podcast search failed:', error instanceof Error ? error.message : String(error));
    throw new Error('Podcast search unavailable — check your internet connection');
  }
}

/**
 * Get trending podcasts (top 50 by category)
 */
export async function getTrendingPodcasts(): Promise<Podcast[]> {
  if (!checkRateLimit()) {
    throw new Error('Podcast trending rate limited — please wait');
  }

  // iTunes top podcasts endpoint (no query required)
  const url = `${ITUNES_API}?media=podcast&entity=podcast&limit=25&explicit=no`;

  try {
    const res = await timedFetch(url);
    if (!res.ok) throw new Error(`iTunes API returned ${res.status}`);

    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    return data.results
      .filter((item: any) => item.feedUrl)
      .map((item: any) => ({
        id: `podcast_${item.collectionId}`,
        title: item.collectionName || 'Unknown',
        artist: item.artistName || 'Unknown',
        description: item.shortDescription || '',
        artworkUrl: item.artworkUrl600 || item.artworkUrl100 || '',
        feedUrl: item.feedUrl,
        episodeCount: item.trackCount || 0,
      }))
      .slice(0, 20);
  } catch (error) {
    console.debug('Trending podcasts fetch failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Convert Podcast to Track-like object for queue playback
 */
export function podcastToTrack(podcast: Podcast): any {
  return {
    id: podcast.id,
    title: podcast.title,
    artist: podcast.artist,
    album: 'Podcast',
    duration: 0,
    uri: podcast.feedUrl, // Feed URL for RSS parser to resolve
    artwork: podcast.artworkUrl,
    source: 'podcast',
  };
}
