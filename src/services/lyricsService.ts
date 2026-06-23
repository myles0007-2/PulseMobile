import { LyricLine } from '../types';

function parseSyncedLyrics(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^\[(\d+):(\d+\.\d+)\]\s*(.*)$/);
    if (!m) continue;
    const time = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
    const text = m[3].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

export async function fetchLyrics(
  artist: string,
  title: string,
  album: string,
  duration: number
): Promise<LyricLine[]> {
  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
      album_name: album,
      duration: String(Math.round(duration)),
    });
    const res = await fetch(`https://lrclib.net/api/get?${params}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data?.syncedLyrics) return parseSyncedLyrics(data.syncedLyrics);
    if (data?.plainLyrics) {
      return data.plainLyrics
        .split('\n')
        .filter((t: string) => t.trim())
        .map((text: string, i: number) => ({ time: i * 4, text }));
    }
  } catch {}
  return [];
}

export function getCurrentLyricIndex(lines: LyricLine[], position: number): number {
  let idx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= position) idx = i;
    else break;
  }
  return idx;
}
