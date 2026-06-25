import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore, useColors } from '../store/useStore';
import { MiniPlayer } from '../components/MiniPlayer';
import { player } from '../services/audioPlayer';
import { spacing, fontSize, radius } from '../theme';
import { searchPodcasts, getTrendingPodcasts, Podcast } from '../services/itunesAPI';
import { fetchPodcast, episodeToTrack } from '../services/podcastService';
import { PodcastEpisode } from '../types';

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function PodcastsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const {
    podcastSubscriptions, addPodcastSubscription, removePodcastSubscription,
    playTrack, getPodcastResume, podcastResumes,
  } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Podcast[]>([]);
  const [trending, setTrending] = useState<Podcast[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'subscribed' | 'trending'>('trending');

  // Episode browsing state
  const [openPodcast, setOpenPodcast] = useState<{ title: string; feedUrl: string } | null>(null);
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    try {
      const results = await searchPodcasts(searchQuery);
      setSearchResults(results);
    } catch (error) {
      Alert.alert('Search Error', error instanceof Error ? error.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  const handleLoadTrending = useCallback(async () => {
    setIsLoading(true);
    try {
      const results = await getTrendingPodcasts();
      setTrending(results);
    } catch (error) {
      console.warn('Trending load failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSubscribe = (podcast: Podcast) => {
    const isSubscribed = podcastSubscriptions.some(p => p.id === podcast.id);
    if (isSubscribed) {
      removePodcastSubscription(podcast.id);
    } else {
      addPodcastSubscription({
        id: podcast.id,
        title: podcast.title,
        artist: podcast.artist,
        feedUrl: podcast.feedUrl,
        artworkUrl: podcast.artworkUrl,
        subscribedAt: Date.now(),
        episodeCount: podcast.episodeCount,
      });
    }
  };

  const browseEpisodes = useCallback(async (title: string, feedUrl: string) => {
    if (!feedUrl) {
      Alert.alert('Unavailable', 'This podcast has no feed URL.');
      return;
    }
    setOpenPodcast({ title, feedUrl });
    setEpisodes([]);
    setLoadingEpisodes(true);
    try {
      const data = await fetchPodcast(feedUrl);
      setEpisodes(data.episodes);
    } catch (error) {
      Alert.alert('Could not load episodes', error instanceof Error ? error.message : 'Feed unavailable');
      setOpenPodcast(null);
    } finally {
      setLoadingEpisodes(false);
    }
  }, []);

  const playEpisode = useCallback(async (ep: PodcastEpisode) => {
    try {
      const track = episodeToTrack(ep);
      await playTrack(track, episodes.map(episodeToTrack));
      const resume = getPodcastResume(track.id, track.album);
      if (resume && resume.position > 5 && resume.position < (ep.duration || Infinity) - 10) {
        // Give the player a moment to load before seeking to the saved position.
        setTimeout(() => { player.seekTo(resume.position).catch(() => {}); }, 400);
      }
    } catch (error) {
      Alert.alert('Playback Error', error instanceof Error ? error.message : 'Could not play episode');
    }
  }, [episodes, playTrack, getPodcastResume]);

  const PodcastRow = ({ podcast }: { podcast: Podcast }) => {
    const isSubscribed = podcastSubscriptions.some(p => p.id === podcast.id);
    return (
      <Pressable
        style={[styles.podcastRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
        onPress={() => browseEpisodes(podcast.title, podcast.feedUrl)}
      >
        <View style={styles.podcastInfo}>
          <Text style={[styles.podcastTitle, { color: colors.text }]} numberOfLines={2}>
            {podcast.title}
          </Text>
          <Text style={[styles.podcastArtist, { color: colors.textSecondary }]} numberOfLines={1}>
            {podcast.artist}
          </Text>
          <Text style={[styles.episodeCount, { color: colors.textSecondary }]}>
            {podcast.episodeCount} episodes · Tap to browse
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => handleSubscribe(podcast)}
          style={[
            styles.subscribeBtn,
            {
              backgroundColor: isSubscribed ? colors.primary : 'transparent',
              borderColor: colors.primary,
              borderWidth: 1,
            },
          ]}
        >
          <Text style={{ color: isSubscribed ? colors.bg : colors.primary, fontWeight: '600' }}>
            {isSubscribed ? '✓' : '+'}
          </Text>
        </Pressable>
      </Pressable>
    );
  };

  const EpisodeRow = ({ ep }: { ep: PodcastEpisode }) => {
    const resume = podcastResumes[`${ep.podcastTitle || 'Podcast'}::${ep.id}`] || null;
    const isComplete = resume && ep.duration > 0 && resume.position >= ep.duration - 10;
    const hasResume = resume && resume.position > 5 && !isComplete;
    return (
      <Pressable
        style={[styles.episodeRow, { borderBottomColor: colors.border }]}
        onPress={() => playEpisode(ep)}
      >
        <Ionicons
          name={hasResume ? 'play-circle' : 'play-circle-outline'}
          size={32}
          color={hasResume ? colors.primary : colors.textSecondary}
          style={{ marginRight: spacing.sm }}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.episodeTitle, { color: colors.text }]} numberOfLines={2}>{ep.title}</Text>
          <Text style={[styles.episodeMeta, { color: colors.textSecondary }]}>
            {ep.duration > 0 ? fmtTime(ep.duration) : 'Episode'}
            {hasResume ? `  ·  Resume from ${fmtTime(resume!.position)}` : ''}
            {isComplete ? '  ·  ✓ Played' : ''}
          </Text>
        </View>
      </Pressable>
    );
  };

  const renderContent = () => {
    if (activeTab === 'search') {
      return (
        <>
          <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search podcasts..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              autoCapitalize="none"
            />
            <Pressable onPress={handleSearch} style={styles.searchBtn}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Search</Text>
            </Pressable>
          </View>
          {isLoading && <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />}
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <PodcastRow podcast={item} />}
            scrollEnabled={false}
            ListEmptyComponent={
              !isLoading && searchResults.length === 0 && searchQuery ? (
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No results found</Text>
              ) : null
            }
          />
        </>
      );
    }

    if (activeTab === 'subscribed') {
      return (
        <FlatList
          data={podcastSubscriptions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PodcastRow
              podcast={{
                id: item.id,
                title: item.title,
                artist: item.artist,
                feedUrl: item.feedUrl,
                artworkUrl: item.artworkUrl,
                episodeCount: item.episodeCount,
                description: item.description || '',
              }}
            />
          )}
          scrollEnabled={false}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No subscriptions yet</Text>
          }
        />
      );
    }

    return (
      <>
        {isLoading && <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />}
        <FlatList
          data={trending}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PodcastRow podcast={item} />}
          scrollEnabled={false}
          ListEmptyComponent={
            !isLoading && trending.length === 0 ? (
              <Pressable onPress={handleLoadTrending}>
                <Text style={[styles.emptyText, { color: colors.primary }]}>Tap to load trending</Text>
              </Pressable>
            ) : null
          }
        />
      </>
    );
  };

  React.useEffect(() => {
    if (activeTab === 'trending' && trending.length === 0) {
      handleLoadTrending();
    }
  }, [activeTab, trending.length, handleLoadTrending]);

  // Episode browsing view (overlays the tab content when a podcast is open)
  if (openPodcast) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }]}>
          <Pressable onPress={() => setOpenPodcast(null)} hitSlop={10} style={{ marginRight: spacing.sm }}>
            <Ionicons name="chevron-back" size={26} color={colors.primary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.text, flex: 1 }]} numberOfLines={1}>{openPodcast.title}</Text>
        </View>
        {loadingEpisodes ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : (
          <FlatList
            data={episodes}
            keyExtractor={(ep) => ep.id}
            renderItem={({ item }) => <EpisodeRow ep={item} />}
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={8}
            removeClippedSubviews
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No episodes found</Text>
            }
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        )}
        <MiniPlayer />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Podcasts</Text>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['trending', 'search', 'subscribed'] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[
              styles.tab,
              {
                borderBottomColor: activeTab === tab ? colors.primary : 'transparent',
                borderBottomWidth: activeTab === tab ? 2 : 0,
              },
            ]}
          >
            <Text
              style={[
                styles.tabLabel,
                {
                  color: activeTab === tab ? colors.primary : colors.textSecondary,
                  fontWeight: activeTab === tab ? '700' : '500',
                },
              ]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {renderContent()}
        <View style={{ height: spacing.lg }} />
      </ScrollView>

      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: fontSize.lg, fontWeight: '700' },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.md, borderBottomWidth: 1 },
  tab: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  tabLabel: { fontSize: fontSize.sm },
  content: { flex: 1, paddingVertical: spacing.md },
  searchContainer: { marginHorizontal: spacing.md, marginBottom: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  searchInput: { flex: 1, paddingVertical: spacing.sm, fontSize: fontSize.md },
  searchBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  loader: { marginVertical: spacing.lg },
  podcastRow: { marginHorizontal: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  podcastInfo: { flex: 1 },
  podcastTitle: { fontSize: fontSize.md, fontWeight: '600' },
  podcastArtist: { fontSize: fontSize.sm, marginTop: spacing.xs },
  episodeCount: { fontSize: fontSize.xs, marginTop: spacing.xs },
  subscribeBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: spacing.sm },
  episodeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  episodeTitle: { fontSize: fontSize.md, fontWeight: '500' },
  episodeMeta: { fontSize: fontSize.xs, marginTop: 2 },
  emptyText: { textAlign: 'center', paddingVertical: spacing.lg, fontSize: fontSize.md },
});
