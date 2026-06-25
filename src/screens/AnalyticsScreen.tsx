import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors } from '../store/useStore';
import { MiniPlayer } from '../components/MiniPlayer';
import { spacing, fontSize, radius } from '../theme';
import { formatDuration, ListeningStats } from '../services/analyticsEngine';

export function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { listeningStats, history, computeListeningStats } = useStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    computeListeningStats();
  }, [history, computeListeningStats]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    computeListeningStats();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const stats = listeningStats as ListeningStats;

  const StatBox = ({ label, value }: { label: string; value: string }) => (
    <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.primary }]}>{value}</Text>
    </View>
  );

  const ArtistRow = ({ name, count }: { name: string; count: number }) => (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{name}</Text>
      <Text style={[styles.rowValue, { color: colors.textSecondary }]}>#{count}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Listening Analytics</Text>
        <Pressable onPress={handleRefresh} style={[styles.refreshBtn, { opacity: isRefreshing ? 0.5 : 1 }]}>
          <Text style={{ color: colors.primary }}>⟳</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary Stats */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SUMMARY</Text>
          <View style={styles.statGrid}>
            <StatBox label="Total Time" value={formatDuration(stats.totalListeningTime)} />
            <StatBox label="Tracks" value={String(stats.totalTracks)} />
            <StatBox label="Artists" value={String(stats.uniqueArtists)} />
            <StatBox label="Streak" value={`${stats.listeningStreak} days`} />
          </View>
        </View>

        {/* Top Artists */}
        {stats.topArtists.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>TOP ARTISTS</Text>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {stats.topArtists.slice(0, 5).map((artist, i) => (
                <ArtistRow key={artist.name} name={artist.name} count={artist.count} />
              ))}
            </View>
          </View>
        )}

        {/* Top Genres */}
        {stats.topGenres.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>TOP GENRES</Text>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              {stats.topGenres.slice(0, 5).map((genre) => (
                <ArtistRow key={genre.genre} name={genre.genre} count={genre.count} />
              ))}
            </View>
          </View>
        )}

        {/* Listening Habits */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>LISTENING HABITS</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <ArtistRow name="Favorite Time" count={0} />
            <ArtistRow name="Most Listened" count={0} />
            {stats.newestArtistDiscovery && (
              <ArtistRow
                name={`New Discovery: ${stats.newestArtistDiscovery.name}`}
                count={0}
              />
            )}
          </View>
        </View>

        <View style={{ height: spacing.lg }} />
      </ScrollView>

      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1 },
  title: { fontSize: fontSize.lg, fontWeight: '700' },
  refreshBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  content: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.xs },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statBox: { flex: 1, minWidth: '48%', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  statLabel: { fontSize: fontSize.sm, marginBottom: spacing.xs },
  statValue: { fontSize: fontSize.lg, fontWeight: '700' },
  card: { borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44, alignItems: 'center', borderBottomWidth: 1 },
  rowLabel: { fontSize: fontSize.md, flex: 1 },
  rowValue: { fontSize: fontSize.md, fontWeight: '600' },
});
