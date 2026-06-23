export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  uri: string;
  artwork?: string;
  source: 'local' | 'youtube' | 'podcast';
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artwork?: string;
  trackIds: string[];
}

export interface Playlist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
}

export interface HistoryEntry {
  track: Track;
  playedAt: number;
}

export interface LyricLine {
  time: number;
  text: string;
}

export interface PodcastEpisode {
  id: string;
  title: string;
  podcastTitle: string;
  artwork?: string;
  audioUrl: string;
  duration: number;
  pubDate: string;
  description?: string;
}

export interface Podcast {
  title: string;
  artwork?: string;
  feedUrl: string;
  episodes: PodcastEpisode[];
}

export interface YoutubeResult {
  videoId: string;
  title: string;
  author: string;
  durationSeconds: number;
  thumbnail: string;
}
