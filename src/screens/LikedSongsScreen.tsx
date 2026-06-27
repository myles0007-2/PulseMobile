import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors } from '../store/useStore';
import { TrackItem } from '../components/TrackItem';
import { MiniPlayer } from '../components/MiniPlayer';
import { spacing, fontSize, radius } from '../theme';
import { batchQueueDownloads } from '../services/batchDownloadService';

export function LikedSongsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { tracks, likedIds, playTrack, currentTrack } = useStore();
  const [isDownloading, setIsDownloading] = useState(false);

  const liked = useMemo(
    () => tracks.filter((t) => likedIds.has(t.id)),
    [tracks, likedIds]
  );

  const handleDownloadAll = async () => {
    if (liked.length === 0) {
      Alert.alert('No Liked Songs', 'Add songs to your liked list first.');
      return;
    }

    setIsDownloading(true);
    try {
      await batchQueueDownloads(liked);
      Alert.alert('Downloaded', `Queued ${liked.length} songs for download.`);
    } catch (e) {
      Alert.alert('Download Error', 'Failed to queue downloads.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={{ fontSize: 36, marginBottom: spacing.xs }}>♥</Text>
          <Text style={[styles.title, { color: colors.text }]}>Liked Songs</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>{liked.length} songs</Text>
        </View>
        {liked.length > 0 && (
          <Pressable
            style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
            onPress={handleDownloadAll}
            disabled={isDownloading}
          >
            <Ionicons name={isDownloading ? 'ellipsis-horizontal' : 'download'} size={18} color={colors.bg} />
            <Text style={[styles.downloadBtnText, { color: colors.bg }]}>
              {isDownloading ? 'Queueing...' : 'Download All'}
            </Text>
          </Pressable>
        )}
      </View>

      {liked.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Tap the ♡ icon on any track or in Now Playing to save it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={liked}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TrackItem
              track={item}
              isActive={currentTrack?.id === item.id}
              onPress={() => playTrack(item, liked)}
            />
          )}
          contentContainerStyle={{ paddingBottom: 80 }}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          removeClippedSubviews
        />
      )}
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  title: { fontSize: fontSize.xxl, fontWeight: '800' },
  sub: { fontSize: fontSize.sm, marginTop: 4 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  downloadBtnText: { fontSize: fontSize.sm, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: fontSize.md, textAlign: 'center', lineHeight: 22 },
});
