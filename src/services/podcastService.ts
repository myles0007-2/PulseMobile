import { Podcast, PodcastEpisode } from '../types';

// Well-known podcast feeds
export const FEATURED_FEEDS = [
  { title: 'The Daily (NYT)', url: 'https://feeds.simplecast.com/54nAGcIl' },
  { title: 'How I Built This', url: 'https://feeds.npr.org/510313/podcast.xml' },
  { title: 'Darknet Diaries', url: 'https://feeds.megaphone.fm/darknetdiaries' },
  { title: 'Lex Fridman', url: 'https://lexfridman.com/feed/podcast/' },
  { title: 'Huberman Lab', url: 'https://feeds.megaphone.fm/hubermanlab' },
  { title: 'My First Million', url: 'https://feeds.megaphone.fm/mfm' },
  { title: 'Crime Junkie', url: 'https://feeds.audioboom.com/posts/rss?series_id=2944061' },
  { title: 'Serial', url: 'https://feeds.thisiscriminal.com/CriminalSerial' },
];

function extractText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'));
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i'));
  return m ? m[1] : '';
}

function parseDuration(raw: string): number {
  if (!raw) return 0;
  const parts = raw.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseInt(raw, 10) || 0;
}

export async function fetchPodcast(feedUrl: string): Promise<Podcast> {
  const res = await fetch(feedUrl, { headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!res.ok) throw new Error(`Failed to fetch feed: ${res.status}`);
  const xml = await res.text();

  // Channel info
  const channelMatch = xml.match(/<channel>([\s\S]*)<\/channel>/i);
  const channelXml = channelMatch?.[1] ?? xml;

  const title = extractText(channelXml.split('<item')[0], 'title') || 'Podcast';

  // Artwork: <itunes:image href="..."> or <image><url>...</url>
  const itunesImg = channelXml.match(/<itunes:image[^>]*href="([^"]+)"/i)?.[1];
  const imgUrl = itunesImg ?? extractText(channelXml.split('<item')[0].match(/<image>([\s\S]*?)<\/image>/i)?.[1] ?? '', 'url');

  // Parse items
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  const episodes: PodcastEpisode[] = [];

  for (const m of itemMatches) {
    const item = m[1];
    const epTitle = extractText(item, 'title');
    const audioUrl = extractAttr(item, 'enclosure', 'url');
    if (!audioUrl || !audioUrl.startsWith('http')) continue;

    const durationRaw = extractText(item, 'itunes:duration') || extractText(item, 'duration');
    const pubDate = extractText(item, 'pubDate');

    episodes.push({
      id: `pod::${audioUrl}`,
      title: epTitle || 'Episode',
      podcastTitle: title,
      artwork: imgUrl || undefined,
      audioUrl,
      duration: parseDuration(durationRaw),
      pubDate,
      description: extractText(item, 'description').slice(0, 300),
    });
  }

  return { title, artwork: imgUrl || undefined, feedUrl, episodes };
}

export function episodeToTrack(ep: PodcastEpisode) {
  return {
    id: ep.id,
    title: ep.title,
    artist: ep.podcastTitle,
    album: 'Podcast',
    duration: ep.duration,
    uri: ep.audioUrl,
    artwork: ep.artwork,
    source: 'podcast' as const,
  };
}
