import React, { useMemo } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors } from '../store/useStore';
import { TrackItem } from '../components/TrackItem';
import { MiniPlayer } from '../components/MiniPlayer';
import { spacing, fontSize } from '../theme';

export function LikedSongsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { tracks, likedIds, playTrack, currentTrack } = useStore();

  const liked = useMemo(
    () => tracks.filter((t) => likedIds.has(t.id)),
    [tracks, likedIds]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={{ fontSize: 36, marginBottom: spacing.xs }}>♥</Text>
        <Text style={[styles.title, { color: colors.text }]}>Liked Songs</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{liked.length} songs</Text>
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
        />
      )}
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: '800' },
  sub: { fontSize: fontSize.sm, marginTop: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: fontSize.md, textAlign: 'center', lineHeight: 22 },
});
