import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useStore, useColors } from '../store/useStore';
import { TrackItem } from '../components/TrackItem';
import { MiniPlayer } from '../components/MiniPlayer';
import { LibrarySkeletonLoader } from '../components/SkeletonLoader';
import { spacing, fontSize, radius } from '../theme';
import { Track } from '../types';
import { scanLibrary, loadCachedLibrary, clearLibraryCache } from '../services/libraryService';
import { requestMusicPermission, isAvailable as isMusicModuleAvailable } from '../services/iosMusicLibrary';

type Tab = 'tracks' | 'albums' | 'artists';

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { tracks, albums, isLibraryLoaded, isScanning, setLibrary, setScanning, setScanProgress, playTrack, currentTrack } = useStore();
  const restorePlayback = useStore((s) => s._restorePlaybackIfNeeded);
  const [activeTab, setActiveTab] = useState<Tab>('tracks');
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    console.log('[LibraryScreen] Mounted. isLibraryLoaded:', isLibraryLoaded);
    // CRASH FIX: Do NOT load library on mount—defer to user action or manual trigger
    // The library scan was crashing on first load, so skip it on mount
    // User can tap "Load Music Library" button to trigger it manually
    console.log('[LibraryScreen] Skipping auto-load on mount (user can trigger manually)');
  }, []);

  // CRASH FIX: Restore playback after library loads (only if library was actually loaded)
  React.useEffect(() => {
    if (isLibraryLoaded && tracks.length > 0) {
      console.log('[LibraryScreen] Library loaded, attempting to restore playback...');
      try {
        restorePlayback();
      } catch (e) {
        console.warn('[LibraryScreen] Restore playback failed:', e instanceof Error ? e.message : String(e));
      }
    }
  }, [isLibraryLoaded, tracks.length, restorePlayback]);

  const loadLibrary = useCallback(async (forceRescan: boolean) => {
    try {
      if (!forceRescan) {
        try {
          const cached = await loadCachedLibrary();
          if (cached) {
            console.log('[LibraryScreen] Loaded from cache:', cached.tracks.length, 'tracks');
            setLibrary(cached.tracks, cached.albums);
            return;
          }
        } catch (cacheErr) {
          console.warn('[LibraryScreen] Cache load failed:', cacheErr instanceof Error ? cacheErr.message : String(cacheErr));
        }
      } else {
        try {
          await clearLibraryCache();
          console.log('[LibraryScreen] Cache cleared');
        } catch (clearErr) {
          console.warn('[LibraryScreen] Cache clear failed:', clearErr instanceof Error ? clearErr.message : String(clearErr));
        }
      }

      // Ask for iTunes/Music library permission if the native module is present
      if (isMusicModuleAvailable()) {
        try {
          console.log('[LibraryScreen] Requesting music permission...');
          const granted = await requestMusicPermission();
          if (!granted) {
            console.log('[LibraryScreen] Permission denied');
            Alert.alert(
              'Music Library Access',
              'Allow PulseMobile to access your Music library so it can find your iTunes songs.\n\nGo to Settings → PulseMobile → Media & Apple Music → Allow.',
              [{ text: 'OK' }]
            );
          } else {
            console.log('[LibraryScreen] Permission granted');
          }
        } catch (permErr) {
          console.warn('[LibraryScreen] Permission request failed:', permErr instanceof Error ? permErr.message : String(permErr));
        }
      }

      setScanning(true);
      try {
        console.log('[LibraryScreen] Starting library scan...');
        const { tracks: t, albums: a } = await scanLibrary((loaded, _total) => {
          console.log('[LibraryScreen] Scan progress:', loaded);
          setScanProgress(loaded);
        });
        console.log('[LibraryScreen] Scan complete:', t.length, 'tracks');
        setLibrary(t, a);
      } catch (scanErr) {
        console.error('[LibraryScreen] Scan failed:', scanErr instanceof Error ? scanErr.stack : String(scanErr));
        Alert.alert('Scan Error', scanErr instanceof Error ? scanErr.message : 'Library scan failed');
      } finally {
        setScanning(false);
      }
    } catch (e) {
      console.error('[LibraryScreen] loadLibrary outer catch:', e instanceof Error ? e.stack : String(e));
      Alert.alert('Library Error', 'Failed to load library');
    }
  }, []);

  const importFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'public.audio'],
        multiple: true,
        copyToCacheDirectory: false,
      });
      if (result.canceled || !result.assets) return;
      const imported: Track[] = result.assets.map((a) => ({
        id: `import::${a.uri}`,
        title: a.name?.replace(/\.[^.]+$/, '') ?? 'Unknown',
        artist: 'Unknown Artist',
        album: 'Imported',
        duration: 0,
        uri: a.uri,
        source: 'local' as const,
      }));
      setLibrary([...tracks.filter((t) => !imported.find((i) => i.id === t.id)), ...imported], albums);
    } catch {}
  }, [tracks, albums]);

  const filtered = useMemo(() => {
    if (!search) return tracks;
    const q = search.toLowerCase();
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
    );
  }, [tracks, search]);

  const artists = useMemo(
    () => Array.from(new Set(tracks.map((t) => t.artist))).sort(),
    [tracks]
  );

  const renderTrack = useCallback(
    ({ item }: { item: Track }) => (
      <TrackItem
        track={item}
        isActive={currentTrack?.id === item.id}
        onPress={() => playTrack(item, filtered)}
      />
    ),
    [currentTrack, filtered, playTrack]
  );

  return (
    <View style={[{ flex: 1, backgroundColor: colors.bg }, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Library</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
            onPress={importFiles}
            hitSlop={8}
          >
            <Ionicons name="add" size={14} color={colors.primary} />
            <Text style={[styles.iconBtnText, { color: colors.primary }]}>Files</Text>
          </Pressable>
          <Pressable
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
            onPress={() => loadLibrary(true)}
            hitSlop={8}
          >
            <Ionicons name="refresh" size={14} color={colors.primary} />
            <Text style={[styles.iconBtnText, { color: colors.primary }]}>Rescan</Text>
          </Pressable>
        </View>
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: colors.card }]}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search tracks, artists, albums…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          autoCapitalize="none"
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['tracks', 'albums', 'artists'] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && { backgroundColor: colors.primary },
            ]}
            onPress={() => { setActiveTab(tab); setSearch(''); }}
          >
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? colors.bg : colors.textSecondary },
              ]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {isScanning ? (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={[styles.scanHeader, { borderBottomColor: colors.border }]}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={[styles.scanText, { color: colors.textSecondary }]}>
              Scanning music library…
            </Text>
          </View>
          <LibrarySkeletonLoader />
        </View>
      ) : tracks.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="musical-notes-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.text }]}>No music found</Text>
          <Text style={[styles.emptySubText, { color: colors.textSecondary }]}>
            Tap "Load Music Library" to read your iTunes / 3uTools synced music.{'\n\n'}
            Or use "Files" to import individual audio files.
          </Text>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => loadLibrary(false)}
          >
            <Text style={[styles.primaryBtnText, { color: colors.bg }]}>Load Music Library</Text>
          </Pressable>
          <Text style={[styles.helpText, { color: colors.textMuted }]}>
            Music synced via 3uTools, iTunes, or Apple Music will appear automatically.
          </Text>
        </View>
      ) : activeTab === 'tracks' ? (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          renderItem={renderTrack}
          getItemLayout={(_data, index) => ({ length: 64, offset: 64 * index, index })}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          windowSize={8}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => loadLibrary(true)}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ color: colors.textSecondary }}>No results for "{search}"</Text>
            </View>
          }
          ListHeaderComponent={
            <Text style={[styles.listCount, { color: colors.textMuted }]}>
              {filtered.length} track{filtered.length !== 1 ? 's' : ''}
            </Text>
          }
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      ) : activeTab === 'albums' ? (
        <FlatList
          data={albums.filter(
            (a) =>
              !search ||
              a.title.toLowerCase().includes(search.toLowerCase()) ||
              a.artist.toLowerCase().includes(search.toLowerCase())
          )}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => {
            const albumTracks = tracks.filter(
              (t) => t.album === item.title && t.artist === item.artist
            );
            return (
              <Pressable
                style={[styles.albumRow, { borderBottomColor: colors.border }]}
                onPress={() => albumTracks[0] && playTrack(albumTracks[0], albumTracks)}
              >
                <View style={[styles.albumArtPlaceholder, { backgroundColor: colors.card }]}>
                  <Ionicons name="disc-outline" size={26} color={colors.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.albumTitle, { color: colors.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text
                    style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {item.artist} · {item.trackIds.length} tracks
                  </Text>
                </View>
                <Ionicons name="play-circle-outline" size={28} color={colors.textMuted} />
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      ) : (
        <FlatList
          data={artists.filter(
            (a) => !search || a.toLowerCase().includes(search.toLowerCase())
          )}
          keyExtractor={(a) => a}
          renderItem={({ item }) => {
            const artistTracks = tracks.filter((t) => t.artist === item);
            return (
              <Pressable
                style={[styles.artistRow, { borderBottomColor: colors.border }]}
                onPress={() => playTrack(artistTracks[0], artistTracks)}
              >
                <View style={[styles.artistAvatar, { backgroundColor: colors.primary + '33' }]}>
                  <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '800' }}>
                    {item.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '600' }}
                    numberOfLines={1}
                  >
                    {item}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 }}>
                    {artistTracks.length} track{artistTracks.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}

      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: { fontSize: fontSize.xxl, fontWeight: '800' },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  iconBtnText: { fontSize: fontSize.sm, fontWeight: '600' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, paddingVertical: spacing.sm },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.md, marginBottom: spacing.sm, gap: 6 },
  tab: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  tabText: { fontSize: fontSize.sm, fontWeight: '600' },
  listCount: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: fontSize.lg, fontWeight: '700', textAlign: 'center' },
  emptySubText: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
  },
  primaryBtnText: { fontWeight: '700', fontSize: fontSize.md },
  helpText: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: spacing.xs },
  albumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
  },
  albumArtPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  albumTitle: { fontSize: fontSize.md, fontWeight: '600' },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 60,
    gap: spacing.sm,
  },
  artistAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  scanText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
