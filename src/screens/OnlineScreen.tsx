import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable,
  StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors } from '../store/useStore';
import { useDebounce } from '../hooks/useDebounce';
import { MiniPlayer } from '../components/MiniPlayer';
import { TrackItem } from '../components/TrackItem';
import { spacing, fontSize, radius } from '../theme';
import { YoutubeResult, PodcastEpisode } from '../types';
import { searchYoutube, youtubeResultToTrack } from '../services/youtubeService';
import { fetchPodcast, episodeToTrack, FEATURED_FEEDS } from '../services/podcastService';

type Mode = 'youtube' | 'podcasts';

function SecFmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

// Curated genre/playlist suggestions that work well with YouTube search
const CURATED_SEARCHES = [
  'Top Hits 2025',
  'Country Hits Playlist',
  'Hip Hop Mix',
  'RnB Chill Mix',
  'Rock Classics',
  'Pop Workout Mix',
];

const MAX_PLAYBACK_RETRIES = 2;

export function OnlineScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { playTrack, currentTrack, tracks } = useStore();
  const [mode, setMode] = useState<Mode>('youtube');
  const [search, setSearch] = useState('');
  const [ytResults, setYtResults] = useState<YoutubeResult[]>([]);
  const [ytLoading, setYtLoading] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [podcastEps, setPodcastEps] = useState<PodcastEpisode[]>([]);
  const [podcastTitle, setPodcastTitle] = useState('');
  const [podcastLoading, setPodcastLoading] = useState(false);
  const [customFeedUrl, setCustomFeedUrl] = useState('');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [retryAttempts, setRetryAttempts] = useState<Map<string, number>>(new Map());
  const [isOffline, setIsOffline] = useState(false);

  // Pull up to 8 unique artists from the user's library as quick-search chips
  const libraryArtists = useMemo(() => {
    const artists = Array.from(new Set(tracks.map((t) => t.artist)))
      .filter((a) => a !== 'Unknown Artist')
      .sort(() => Math.random() - 0.5)
      .slice(0, 8);
    return artists;
  }, [tracks.length]);

  const doYoutubeSearch = useCallback(async (query?: string) => {
    const q = (query ?? search).trim();
    if (!q) {
      setYtResults([]);
      return;
    }
    setYtLoading(true);
    try {
      setYtResults(await searchYoutube(q));
      setIsOffline(false);
    } catch (e: any) {
      const isNetworkError = e.message?.toLowerCase().includes('network') || e.message?.toLowerCase().includes('offline');
      if (isNetworkError || !e.message) setIsOffline(true);
      Alert.alert('Search Error', e.message || 'Could not reach streaming service. Check your connection.');
    } finally {
      setYtLoading(false);
    }
  }, [search]);

  // Debounced search: waits 500ms after user stops typing before searching
  const debouncedSearch = useDebounce(async (query: string) => {
    setIsDebouncing(false);
    doYoutubeSearch(query);
  }, 500);

  const handleSearchChange = (text: string) => {
    setSearch(text);
    setIsDebouncing(true);
    debouncedSearch(text);
  };

  const searchArtist = useCallback((artist: string) => {
    doYoutubeSearch(`${artist} mix playlist`);
  }, [doYoutubeSearch]);

  const loadPodcast = useCallback(async (url: string) => {
    setPodcastLoading(true);
    setPodcastEps([]);
    try {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) {
        Alert.alert('Invalid URL', 'Please enter a podcast feed URL');
        return;
      }
      const pod = await fetchPodcast(trimmedUrl);
      setPodcastTitle(pod.title);
      setPodcastEps(pod.episodes);
    } catch (e: any) {
      Alert.alert('Podcast Error', e.message || 'Could not load feed.');
    } finally {
      setPodcastLoading(false);
    }
  }, []);

  const playYt = useCallback(async (result: YoutubeResult) => {
    const trackId = result.videoId;
    const currentAttempts = retryAttempts.get(trackId) ?? 0;

    if (currentAttempts >= MAX_PLAYBACK_RETRIES) {
      Alert.alert(
        'Playback Failed',
        `Unable to play this stream after ${MAX_PLAYBACK_RETRIES} attempts. The stream may be unavailable or blocked.`,
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    setPlayingTrackId(trackId);
    try {
      const track = youtubeResultToTrack(result);
      await playTrack(track, ytResults.map(youtubeResultToTrack));
      setPlayingTrackId(null);
      setRetryAttempts(new Map());
    } catch (error: any) {
      setPlayingTrackId(null);
      const nextAttempt = currentAttempts + 1;
      setRetryAttempts(new Map(retryAttempts).set(trackId, nextAttempt));
      const errorMsg = error?.message || 'Could not play stream';
      const suggestion = nextAttempt === 1
        ? 'Check your internet connection.'
        : 'The stream may be temporarily unavailable. Try another song.';
      Alert.alert(
        'Playback Failed',
        `${errorMsg}\n\n${suggestion}\n\nAttempt ${nextAttempt}/${MAX_PLAYBACK_RETRIES}`,
        [
          {
            text: 'Try Again',
            onPress: () => playYt(result),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    }
  }, [ytResults, playTrack, retryAttempts]);

  const playPodcast = useCallback(async (episode: PodcastEpisode) => {
    const episodeId = episode.id;
    const currentAttempts = retryAttempts.get(episodeId) ?? 0;

    if (currentAttempts >= MAX_PLAYBACK_RETRIES) {
      Alert.alert(
        'Playback Failed',
        `Unable to play this episode after ${MAX_PLAYBACK_RETRIES} attempts. The feed may be offline.`,
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }

    setPlayingTrackId(episodeId);
    try {
      const track = episodeToTrack(episode);
      await playTrack(track, podcastEps.map(episodeToTrack));
      setPlayingTrackId(null);
      setRetryAttempts(new Map());
    } catch (error: any) {
      setPlayingTrackId(null);
      const nextAttempt = currentAttempts + 1;
      setRetryAttempts(new Map(retryAttempts).set(episodeId, nextAttempt));
      const errorMsg = error?.message || 'Could not play episode';
      const suggestion = nextAttempt === 1
        ? 'Check your internet connection and try again.'
        : 'The feed may be offline. Try another episode.';
      Alert.alert(
        'Playback Failed',
        `${errorMsg}\n\n${suggestion}\n\nAttempt ${nextAttempt}/${MAX_PLAYBACK_RETRIES}`,
        [
          {
            text: 'Try Again',
            onPress: () => playPodcast(episode),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    }
  }, [podcastEps, playTrack, retryAttempts]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        <Text style={{ fontSize: fontSize.xxl, fontWeight: '800', color: colors.text }}>Online</Text>
      </View>

      {/* Offline Banner */}
      {isOffline && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.danger }]}>
          <Ionicons name="alert-circle-outline" size={16} color="#fff" />
          <Text style={styles.offlineText}>No Internet Connection</Text>
        </View>
      )}

      {/* Mode toggle */}
      <View style={styles.toggleRow}>
        {(['youtube', 'podcasts'] as Mode[]).map((m) => (
          <Pressable
            key={m}
            style={[
              styles.toggle,
              { borderColor: colors.border },
              mode === m && { backgroundColor: colors.primary, borderColor: colors.primary },
            ]}
            onPress={() => setMode(m)}
          >
            <Ionicons
              name={m === 'youtube' ? 'play-circle-outline' : 'mic-outline'}
              size={15}
              color={mode === m ? colors.bg : colors.textSecondary}
            />
            <Text style={[styles.toggleText, { color: mode === m ? colors.bg : colors.textSecondary }]}>
              {m === 'youtube' ? 'YouTube Music' : 'Podcasts'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── YouTube Music ── */}
      {mode === 'youtube' && (
        <>
          <View style={styles.searchRow}>
            <View style={[styles.searchWrap, { backgroundColor: colors.card }]}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Search YouTube Music…"
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={handleSearchChange}
                onSubmitEditing={() => doYoutubeSearch(search)}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {isDebouncing && (
                <View style={{ marginLeft: 6 }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              )}
            </View>
          </View>

          {ytLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>Searching…</Text>
            </View>
          ) : isDebouncing ? (
            <View style={styles.center}>
              <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>searching…</Text>
            </View>
          ) : ytResults.length > 0 ? (
            <>
              <View style={styles.resultsHeader}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                  {ytResults.length} results
                </Text>
                <Pressable onPress={() => { setYtResults([]); setSearch(''); }}>
                  <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' }}>Clear</Text>
                </Pressable>
              </View>
              <FlatList
                data={ytResults}
                keyExtractor={(r) => r.videoId}
                renderItem={({ item }) => (
                  <TrackItem
                    track={youtubeResultToTrack(item)}
                    isActive={currentTrack?.id === `yt::${item.videoId}`}
                    onPress={() => playYt(item)}
                  />
                )}
                contentContainerStyle={{ paddingBottom: 120 }}
              />
            </>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 120 }}
            >
              {/* From your library */}
              {libraryArtists.length > 0 && (
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>FROM YOUR LIBRARY</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    <View style={styles.chipsRow}>
                      {libraryArtists.map((artist) => (
                        <Pressable
                          key={artist}
                          style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]}
                          onPress={() => searchArtist(artist)}
                        >
                          <Ionicons name="person-outline" size={12} color={colors.primary} />
                          <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>
                            {artist}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Curated suggestions */}
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SUGGESTED PLAYLISTS</Text>
                <View style={styles.suggestGrid}>
                  {CURATED_SEARCHES.map((q) => (
                    <Pressable
                      key={q}
                      style={[styles.suggestCard, { backgroundColor: colors.card }]}
                      onPress={() => doYoutubeSearch(q)}
                    >
                      <Ionicons name="musical-notes" size={18} color={colors.primary} />
                      <Text style={[styles.suggestText, { color: colors.text }]} numberOfLines={2}>
                        {q}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={[styles.infoBox, { backgroundColor: colors.card }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
                <Text style={[styles.infoText, { color: colors.textMuted }]}>
                  Streams audio via free public YouTube frontends. No account needed.
                </Text>
              </View>
            </ScrollView>
          )}
        </>
      )}

      {/* ── Podcasts ── */}
      {mode === 'podcasts' && (
        <>
          <View style={styles.searchRow}>
            <View style={[styles.searchWrap, { backgroundColor: colors.card }]}>
              <Ionicons name="link-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.text }]}
                placeholder="Paste RSS feed URL…"
                placeholderTextColor={colors.textMuted}
                value={customFeedUrl}
                onChangeText={setCustomFeedUrl}
                onSubmitEditing={() => customFeedUrl && loadPodcast(customFeedUrl)}
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="go"
                clearButtonMode="while-editing"
              />
            </View>
            <Pressable
              style={[styles.searchBtn, { backgroundColor: colors.primary }]}
              onPress={() => customFeedUrl && loadPodcast(customFeedUrl)}
            >
              <Text style={{ color: colors.bg, fontWeight: '700', fontSize: fontSize.md }}>Load</Text>
            </Pressable>
          </View>

          {!podcastEps.length && !podcastLoading && (
            <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal: spacing.md }}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>FEATURED PODCASTS</Text>
              {FEATURED_FEEDS.map((feed) => (
                <Pressable
                  key={feed.url}
                  style={[styles.feedRow, { borderBottomColor: colors.border }]}
                  onPress={() => loadPodcast(feed.url)}
                >
                  <View style={[styles.feedIcon, { backgroundColor: colors.card }]}>
                    <Ionicons name="mic" size={22} color={colors.primary} />
                  </View>
                  <Text style={{ flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: '500' }}>
                    {feed.title}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </Pressable>
              ))}
              <View style={{ height: 100 }} />
            </ScrollView>
          )}

          {podcastLoading && (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>Loading podcast…</Text>
            </View>
          )}

          {podcastEps.length > 0 && (
            <>
              <View style={[styles.podHeader, { borderBottomColor: colors.border }]}>
                <Pressable onPress={() => { setPodcastEps([]); setPodcastTitle(''); }}>
                  <Ionicons name="arrow-back" size={22} color={colors.primary} />
                </Pressable>
                <Text
                  style={{ flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: '700', textAlign: 'center', marginHorizontal: 8 }}
                  numberOfLines={1}
                >
                  {podcastTitle}
                </Text>
                <View style={{ width: 22 }} />
              </View>
              <FlatList
                data={podcastEps}
                keyExtractor={(ep) => ep.id}
                renderItem={({ item }) => (
                  <TrackItem
                    track={episodeToTrack(item)}
                    isActive={currentTrack?.id === item.id}
                    onPress={() => playPodcast(item)}
                  />
                )}
                contentContainerStyle={{ paddingBottom: 120 }}
              />
            </>
          )}
        </>
      )}

      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  offlineText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  toggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  toggleText: { fontWeight: '600', fontSize: fontSize.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, paddingVertical: spacing.sm },
  searchBtn: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  chipsRow: { flexDirection: 'row', gap: 8, paddingRight: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    maxWidth: 160,
  },
  chipText: { fontSize: fontSize.sm, fontWeight: '600' },
  suggestGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  suggestCard: {
    width: '47%',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 8,
    minHeight: 72,
    justifyContent: 'space-between',
  },
  suggestText: { fontSize: fontSize.sm, fontWeight: '600', lineHeight: 18 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17 },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    gap: spacing.sm,
  },
  feedIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
