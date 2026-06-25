import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors } from '../store/useStore';
import { MiniPlayer } from '../components/MiniPlayer';
import { spacing, fontSize, radius } from '../theme';
import { searchPodcasts, getTrendingPodcasts, Podcast } from '../services/itunesAPI';
import { podcastManager } from '../services/podcastManager';

export function PodcastsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { podcastSubscriptions, addPodcastSubscription, removePodcastSubscription } = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Podcast[]>([]);
  const [trending, setTrending] = useState<Podcast[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'search' | 'subscribed' | 'trending'>('trending');

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
      Alert.alert('Unsubscribed', `Removed ${podcast.title}`);
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
      Alert.alert('Subscribed', `Added ${podcast.title}`);
    }
  };

  const PodcastRow = ({ podcast }: { podcast: Podcast | (Podcast & { subscribed?: boolean }) }) => {
    const isSubscribed = podcastSubscriptions.some(p => p.id === podcast.id);
    return (
      <Pressable
        style={[styles.podcastRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}
        onPress={() => handleSubscribe(podcast)}
      >
        <View style={styles.podcastInfo}>
          <Text style={[styles.podcastTitle, { color: colors.text }]} numberOfLines={2}>
            {podcast.title}
          </Text>
          <Text style={[styles.podcastArtist, { color: colors.textSecondary }]} numberOfLines={1}>
            {podcast.artist}
          </Text>
          <Text style={[styles.episodeCount, { color: colors.textSecondary }]}>
            {podcast.episodeCount} episodes
          </Text>
        </View>
        <View
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
            <PodcastRow podcast={{ ...item, episodeCount: item.episodeCount, subscribed: true, description: item.description || 'No description' }} />
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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
  subscribeBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  emptyText: { textAlign: 'center', paddingVertical: spacing.lg, fontSize: fontSize.md },
});
