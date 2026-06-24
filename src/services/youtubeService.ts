import AsyncStorage from '@react-native-async-storage/async-storage';
import { YoutubeResult, Track } from '../types';

// ── Invidious instances ───────────────────────────────────────────
const INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.artemislena.eu',
  'https://iv.datura.network',
  'https://invidious.fdn.fr',
  'https://yewtu.be',
  'https://invidious.privacyredirect.com',
  'https://invidious.incogniweb.net',
  'https://inv.tux.pizza',
  'https://yt.cdaut.de',
  'https://invidious.einfachzocken.eu',
  'https://invidious.lunar.icu',
  'https://iv.ggtyler.dev',
  'https://invidious.poast.org',
  'https://invidious.io',
];

// ── Piped API instances (fallback when all Invidious fail) ────────
const PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://piped-api.garudalinux.org',
];

const INSTANCE_KEY = 'yt_active_instance_v2';
const URL_CACHE_KEY = 'yt_url_cache_v1';
const URL_TTL = 4 * 60 * 60 * 1000;
const RATE_LIMIT_MS = 300; // Min 300ms between identical requests

type CacheEntry = { url: string; expiresAt: number };
type SearchCache = { results: YoutubeResult[]; timestamp: number };

let urlCache: Record<string, CacheEntry> = {};
let searchCache: Record<string, SearchCache> = {};
let cacheLoaded = false;
let activeInvidiousIdx = 0;
let lastRequestTime: Record<string, number> = {}; // Track request timestamps for throttling
let cacheSavePromise: Promise<void> | null = null; // Prevent concurrent saveCache calls

async function loadCache() {
  if (cacheLoaded) return;
  try {
    const [raw, savedUrl] = await Promise.all([
      AsyncStorage.getItem(URL_CACHE_KEY),
      AsyncStorage.getItem(INSTANCE_KEY),
    ]);
    if (raw) urlCache = JSON.parse(raw);
    if (savedUrl) {
      const idx = INVIDIOUS.indexOf(savedUrl);
      activeInvidiousIdx = idx >= 0 ? idx : 0;
    }
  } catch (error) {
    console.debug('Failed to load YouTube cache:', error instanceof Error ? error.message : String(error));
  }
  cacheLoaded = true;
}

// Rate limit identical requests (prevent API spam on rapid input)
function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const lastTime = lastRequestTime[key] ?? 0;
  if (now - lastTime < RATE_LIMIT_MS) return false;
  lastRequestTime[key] = now;
  return true;
}

async function saveCache() {
  // Prevent concurrent saves from overwriting each other
  if (cacheSavePromise) return cacheSavePromise;

  const saveOp = (async () => {
    try {
      const now = Date.now();
      // Expire URL cache entries
      for (const k of Object.keys(urlCache)) {
        if (urlCache[k].expiresAt < now) delete urlCache[k];
      }
      // Expire search cache entries (1-hour TTL)
      const SEARCH_TTL = 60 * 60 * 1000;
      for (const k of Object.keys(searchCache)) {
        if (now - searchCache[k].timestamp > SEARCH_TTL) delete searchCache[k];
      }
      await AsyncStorage.setItem(URL_CACHE_KEY, JSON.stringify(urlCache));
    } catch (error) {
      console.warn('Failed to persist YouTube cache:', error instanceof Error ? error.message : String(error));
    } finally {
      cacheSavePromise = null;
    }
  })();

  cacheSavePromise = saveOp;
  return saveOp;
}

function timedFetch(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
}

// Parse JSON safely — Invidious sometimes returns an HTML error page (200 OK, body starts with <)
async function safeJson(res: Response): Promise<any | null> {
  try {
    const text = await res.text();
    if (!text || text.trimStart().startsWith('<')) {
      console.debug('Response was HTML, not JSON (HTTP ' + res.status + ')');
      return null;
    }
    return JSON.parse(text);
  } catch (error) {
    console.debug('JSON parse error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

// Validate stream URL for security (reject SSRF, internal IPs, file://, data://, etc.)
function validateStreamUrl(url: string): boolean {
  try {
    const u = new URL(url);

    // Only allow HTTPS and HTTP (no file://, data://, etc.)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      console.warn(`Invalid URL protocol: ${u.protocol}`);
      return false;
    }

    // Reject private/internal IP ranges
    const hostname = u.hostname;
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||           // 127.0.0.0/8
      hostname.startsWith('10.') ||            // 10.0.0.0/8
      hostname.startsWith('192.168.') ||       // 192.168.0.0/16
      hostname.startsWith('172.') ||           // 172.16.0.0/12
      hostname === '::1' ||                    // IPv6 loopback
      hostname.startsWith('fc') ||             // IPv6 private
      hostname.startsWith('fd')                // IPv6 private
    ) {
      console.warn(`Rejecting internal IP: ${hostname}`);
      return false;
    }

    return true;
  } catch (e) {
    console.warn(`Invalid URL: ${url}`, e);
    return false;
  }
}

async function tryInvidious(path: string): Promise<any | null> {
  const order = [
    ...INVIDIOUS.slice(activeInvidiousIdx),
    ...INVIDIOUS.slice(0, activeInvidiousIdx),
  ];
  for (const inst of order) {
    try {
      const res = await timedFetch(`${inst}${path}`);
      if (!res.ok) continue;
      const data = await safeJson(res);
      if (!data) continue; // HTML response, skip this instance
      const idx = INVIDIOUS.indexOf(inst);
      if (idx !== activeInvidiousIdx) {
        activeInvidiousIdx = idx;
        await AsyncStorage.setItem(INSTANCE_KEY, inst).catch(() => {});
      }
      return data;
    } catch (error) {
      console.debug(`Invidious ${inst} failed:`, error instanceof Error ? error.message : String(error));
    }
  }
  return null;
}

async function tryPiped(path: string): Promise<any | null> {
  for (const inst of PIPED) {
    try {
      const res = await timedFetch(`${inst}${path}`);
      if (!res.ok) continue;
      const data = await safeJson(res);
      if (data) return data;
    } catch (error) {
      console.debug(`Piped ${inst} failed:`, error instanceof Error ? error.message : String(error));
    }
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────

export async function searchYoutube(query: string): Promise<YoutubeResult[]> {
  await loadCache();

  // Rate limit identical searches
  const searchKey = `search:${query}`;
  if (!checkRateLimit(searchKey)) {
    // Return last cached results if available (and not expired), or throw
    const cached = searchCache[query];
    const SEARCH_TTL = 60 * 60 * 1000; // 1 hour TTL
    if (cached && Date.now() - cached.timestamp < SEARCH_TTL) {
      return cached.results;
    }
    throw new Error('Search rate limited — please wait before searching again');
  }

  const q = encodeURIComponent(query);

  const data = await tryInvidious(
    `/api/v1/search?q=${q}&type=video&fields=videoId,title,author,lengthSeconds,videoThumbnails&hl=en`
  );
  if (data && Array.isArray(data)) {
    const results = data
      .filter((v: any) => v.videoId)
      .slice(0, 25)
      .map((v: any) => ({
        videoId: v.videoId,
        title: v.title,
        author: v.author,
        durationSeconds: v.lengthSeconds ?? 0,
        thumbnail:
          v.videoThumbnails?.find((t: any) => t.quality === 'medium')?.url ??
          v.videoThumbnails?.[0]?.url ?? '',
      }));

    // Cache the search results
    searchCache[query] = { results, timestamp: Date.now() };

    return results;
  }

  // Piped fallback
  const piped = await tryPiped(`/search?q=${q}&filter=videos`);
  if (piped) {
    const items: any[] = piped.items ?? [];
    const results = items
      .filter((v: any) => v.url)
      .slice(0, 25)
      .map((v: any) => ({
        videoId: (v.url as string).replace('/watch?v=', ''),
        title: v.title ?? '',
        author: v.uploaderName ?? v.uploader ?? 'Unknown',
        durationSeconds: v.duration ?? 0,
        thumbnail: v.thumbnail ?? '',
      }));

    // Cache the search results
    searchCache[query] = { results, timestamp: Date.now() };

    return results;
  }

  throw new Error('YouTube search is unavailable right now — all streaming servers are offline. Try again shortly.');
}

export async function resolveStreamUrl(videoId: string): Promise<string> {
  await loadCache();

  const cached = urlCache[videoId];
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  // Invidious path
  const data = await tryInvidious(`/api/v1/videos/${videoId}?fields=adaptiveFormats,formatStreams`);
  if (data) {
    const audioFormats: any[] = (data.adaptiveFormats ?? []).filter(
      (f: any) => typeof f.type === 'string' && f.type.startsWith('audio/mp4')
    );
    let url: string | undefined;
    if (audioFormats.length > 0) {
      audioFormats.sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      url = audioFormats[0].url || undefined;
    } else {
      const muxed = (data.formatStreams ?? []).find((f: any) =>
        typeof f.type === 'string' && (f.type.startsWith('video/mp4') || f.type.startsWith('audio/'))
      );
      url = muxed?.url || undefined;
    }
    if (url && typeof url === 'string' && validateStreamUrl(url)) {
      urlCache[videoId] = { url, expiresAt: Date.now() + URL_TTL };
      await saveCache();
      return url;
    }
  }

  // Piped fallback
  const piped = await tryPiped(`/streams/${videoId}`);
  if (piped) {
    const streams: any[] = piped.audioStreams ?? [];
    if (streams.length > 0) {
      streams.sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const url = streams[0].url;
      if (url && typeof url === 'string' && validateStreamUrl(url)) {
        urlCache[videoId] = { url, expiresAt: Date.now() + URL_TTL };
        await saveCache();
        return url;
      }
    }
  }

  throw new Error(`Cannot stream video ${videoId} — all sources offline.`);
}

export function youtubeResultToTrack(result: YoutubeResult): Track {
  return {
    id: `yt::${result.videoId}`,
    title: result.title || 'Unknown Title',
    artist: result.author || 'Unknown Artist',
    album: 'YouTube',
    duration: result.durationSeconds || 0,
    uri: `yt::${result.videoId}`,
    artwork: result.thumbnail || undefined,
    source: 'youtube',
  };
}
