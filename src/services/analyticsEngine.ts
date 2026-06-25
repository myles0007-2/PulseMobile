import { Track, HistoryEntry } from '../types';

export interface ListeningStats {
  totalTracks: number;
  totalListeningTime: number; // seconds
  uniqueArtists: number;
  uniqueAlbums: number;
  topArtists: Array<{ name: string; count: number; seconds: number }>;
  topTracks: Array<{ title: string; artist: string; count: number }>;
  topGenres: Array<{ genre: string; count: number }>;
  dailyStats: Array<{ date: string; seconds: number; trackCount: number }>;
  weekdayStats: Array<{ day: string; seconds: number }>;
  hourlyStats: Array<{ hour: number; seconds: number }>;
  listeningStreak: number; // consecutive days
  favoriteTimeOfDay: string; // morning, afternoon, evening, night
  mostListenedDay: string;
  newestArtistDiscovery: { name: string; date: string } | null;
}

/**
 * Compute listening statistics from history
 * Stateless, can be called repeatedly for latest stats
 */
export function computeStats(history: HistoryEntry[]): ListeningStats {
  if (history.length === 0) {
    return getEmptyStats();
  }

  const stats: ListeningStats = {
    totalTracks: history.length,
    totalListeningTime: 0,
    uniqueArtists: 0,
    uniqueAlbums: 0,
    topArtists: [],
    topTracks: [],
    topGenres: [],
    dailyStats: [],
    weekdayStats: Array(7).fill(null).map((_, i) => ({
      day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i],
      seconds: 0,
    })),
    hourlyStats: Array(24).fill(null).map((_, i) => ({ hour: i, seconds: 0 })),
    listeningStreak: 0,
    favoriteTimeOfDay: 'unknown',
    mostListenedDay: '',
    newestArtistDiscovery: null,
  };

  // Track unique artists and albums
  const artistMap = new Map<string, number>();
  const albumMap = new Map<string, number>();
  const trackMap = new Map<string, { count: number; artist: string }>();
  const genreMap = new Map<string, number>();
  const dailyMap = new Map<string, { seconds: number; trackCount: number }>();
  const artistFirstSeen = new Map<string, number>(); // artist -> timestamp

  let totalSeconds = 0;

  for (const entry of history) {
    // Total listening time
    const duration = entry.track.duration || 0;
    totalSeconds += duration;
    stats.totalListeningTime += duration;

    // Artist stats
    const artist = entry.track.artist || 'Unknown Artist';
    artistMap.set(artist, (artistMap.get(artist) ?? 0) + 1);
    if (!artistFirstSeen.has(artist)) {
      artistFirstSeen.set(artist, entry.playedAt);
    }

    // Album stats
    const album = entry.track.album || 'Unknown Album';
    albumMap.set(album, (albumMap.get(album) ?? 0) + 1);

    // Track stats
    const trackKey = `${entry.track.title}::${artist}`;
    const existing = trackMap.get(trackKey) ?? { count: 0, artist };
    trackMap.set(trackKey, { count: existing.count + 1, artist });

    // Genre stats (derive from artist or album - placeholder for now)
    // In real scenario, would fetch from metadata
    const genre = entry.track.album || 'Mixed';
    genreMap.set(genre, (genreMap.get(genre) ?? 0) + 1);

    // CRASH FIX: guard against malformed playedAt — an invalid Date makes
    // toISOString() throw and getHours()/getDay() return NaN (bad array index).
    const ts = typeof entry.playedAt === 'number' ? entry.playedAt : Date.parse(entry.playedAt as any);
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) continue;

    // Daily stats
    const dateStr = date.toISOString().split('T')[0];
    const dailyEntry = dailyMap.get(dateStr) ?? { seconds: 0, trackCount: 0 };
    dailyMap.set(dateStr, {
      seconds: dailyEntry.seconds + duration,
      trackCount: dailyEntry.trackCount + 1,
    });

    // Hourly stats
    const hour = date.getHours();
    if (stats.hourlyStats[hour]) stats.hourlyStats[hour].seconds += duration;

    // Weekday stats
    const day = date.getDay();
    if (stats.weekdayStats[day]) stats.weekdayStats[day].seconds += duration;
  }

  // Convert maps to arrays and sort
  stats.uniqueArtists = artistMap.size;
  stats.uniqueAlbums = albumMap.size;

  stats.topArtists = Array.from(artistMap.entries())
    .map(([name, count]) => {
      const artistSecondsList = history
        .filter(e => (e.track.artist || 'Unknown Artist') === name)
        .reduce((sum, e) => sum + (e.track.duration || 0), 0);
      return { name, count, seconds: artistSecondsList };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  stats.topTracks = Array.from(trackMap.entries())
    .map(([, { count, artist }]) => {
      const title = trackMap.entries()
        .find(([key]) => key.endsWith(`::${artist}`))?.[0]
        .split('::')[0] || '';
      return { title, artist, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  stats.topGenres = Array.from(genreMap.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Daily stats with streak calculation
  stats.dailyStats = Array.from(dailyMap.entries())
    .map(([date, { seconds, trackCount }]) => ({ date, seconds, trackCount }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate listening streak
  if (stats.dailyStats.length > 0) {
    let streak = 1;
    for (let i = stats.dailyStats.length - 1; i > 0; i--) {
      const curr = new Date(stats.dailyStats[i].date);
      const prev = new Date(stats.dailyStats[i - 1].date);
      const dayDiff = Math.floor((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (dayDiff === 1) {
        streak++;
      } else {
        break;
      }
    }
    stats.listeningStreak = streak;
  }

  // Favorite time of day
  const dayTime = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  stats.hourlyStats.forEach((h, hour) => {
    if (hour >= 6 && hour < 12) dayTime.morning += h.seconds;
    else if (hour >= 12 && hour < 18) dayTime.afternoon += h.seconds;
    else if (hour >= 18 && hour < 21) dayTime.evening += h.seconds;
    else dayTime.night += h.seconds;
  });
  const maxTimeOfDay = Object.entries(dayTime).sort(([, a], [, b]) => b - a)[0];
  stats.favoriteTimeOfDay = maxTimeOfDay?.[0] || 'unknown';

  // Most listened day
  if (stats.weekdayStats.length > 0) {
    const maxDay = stats.weekdayStats.reduce((max, curr) =>
      curr.seconds > max.seconds ? curr : max
    );
    stats.mostListenedDay = maxDay.day;
  }

  // Newest artist discovery
  if (artistFirstSeen.size > 0) {
    const newest = Array.from(artistFirstSeen.entries()).sort((a, b) => b[1] - a[1])[0];
    if (newest) {
      stats.newestArtistDiscovery = {
        name: newest[0],
        date: new Date(newest[1]).toLocaleDateString(),
      };
    }
  }

  return stats;
}

export function getEmptyStats(): ListeningStats {
  return {
    totalTracks: 0,
    totalListeningTime: 0,
    uniqueArtists: 0,
    uniqueAlbums: 0,
    topArtists: [],
    topTracks: [],
    topGenres: [],
    dailyStats: [],
    weekdayStats: Array(7).fill(null).map((_, i) => ({
      day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i],
      seconds: 0,
    })),
    hourlyStats: Array(24).fill(null).map((_, i) => ({ hour: i, seconds: 0 })),
    listeningStreak: 0,
    favoriteTimeOfDay: 'unknown',
    mostListenedDay: '',
    newestArtistDiscovery: null,
  };
}

// Format seconds to readable string (e.g., "3 days 4 hours")
export function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
  if (mins > 0) parts.push(`${mins} min${mins > 1 ? 's' : ''}`);

  return parts.length > 0 ? parts.join(' ') : '0 min';
}
