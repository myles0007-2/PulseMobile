import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors } from '../store/useStore';
import { TrackItem } from '../components/TrackItem';
import { MiniPlayer } from '../components/MiniPlayer';
import { spacing, fontSize } from '../theme';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { history, playTrack, currentTrack, clearHistory } = useStore();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>History</Text>
        {history.length > 0 && (
          <Pressable hitSlop={8} onPress={clearHistory}>
            <Text style={{ color: colors.danger, fontSize: fontSize.sm }}>Clear</Text>
          </Pressable>
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🕐</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Your recently played tracks will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => (
            <View>
              <TrackItem
                track={item.track}
                isActive={currentTrack?.id === item.track.id}
                onPress={() => playTrack(item.track)}
              />
              <Text style={[styles.time, { color: colors.textMuted }]}>{relativeTime(item.playedAt)}</Text>
            </View>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: '800' },
  time: { fontSize: fontSize.xs, paddingHorizontal: spacing.md + 48 + spacing.sm, marginTop: -spacing.sm, marginBottom: spacing.xs },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: fontSize.md, textAlign: 'center', lineHeight: 22 },
});
