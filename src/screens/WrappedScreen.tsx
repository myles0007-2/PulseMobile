import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors } from '../store/useStore';
import { MiniPlayer } from '../components/MiniPlayer';
import { spacing, fontSize, radius } from '../theme';
import { ListeningStats, formatDuration } from '../services/analyticsEngine';
import LinearGradient from 'expo-linear-gradient';

export function WrappedScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { listeningStats, computeListeningStats } = useStore();
  const [currentCard, setCurrentCard] = useState(0);

  useEffect(() => {
    computeListeningStats();
  }, [computeListeningStats]);

  const stats = listeningStats as ListeningStats;

  const cards = [
    {
      title: 'Your 2025 Pulse',
      content: `You listened to ${stats.totalTracks} tracks`,
      stat: formatDuration(stats.totalListeningTime),
    },
    {
      title: 'Top Artist',
      content: stats.topArtists[0]?.name || 'Unknown',
      stat: `${stats.topArtists[0]?.count || 0} plays`,
    },
    {
      title: 'Most Explored Genre',
      content: stats.topGenres[0]?.genre || 'Mixed',
      stat: `${stats.topGenres[0]?.count || 0} tracks`,
    },
    {
      title: 'Your Vibe',
      content: stats.favoriteTimeOfDay.charAt(0).toUpperCase() + stats.favoriteTimeOfDay.slice(1),
      stat: 'Your favorite time',
    },
    {
      title: 'Listen Streak',
      content: `${stats.listeningStreak} days`,
      stat: 'Keep it going!',
    },
  ];

  const handleNext = () => {
    setCurrentCard((c) => (c + 1) % cards.length);
  };

  const handlePrev = () => {
    setCurrentCard((c) => (c - 1 + cards.length) % cards.length);
  };

  const card = cards[currentCard];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>PulseWrapped</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Your 2025 Stats</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Card Display */}
        <View style={styles.cardContainer}>
          <LinearGradient
            colors={[colors.primary + '20', colors.primary + '05']}
            style={[styles.card, { borderColor: colors.primary }]}
          >
            <Text style={[styles.cardTitle, { color: colors.primary }]}>{card.title}</Text>
            <Text style={[styles.cardContent, { color: colors.text }]}>{card.content}</Text>
            <Text style={[styles.cardStat, { color: colors.textSecondary }]}>{card.stat}</Text>
          </LinearGradient>
        </View>

        {/* Navigation */}
        <View style={styles.navigation}>
          <Pressable onPress={handlePrev} style={[styles.navBtn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text }}>← Prev</Text>
          </Pressable>

          <View style={styles.dots}>
            {cards.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === currentCard ? colors.primary : colors.border,
                  },
                ]}
              />
            ))}
          </View>

          <Pressable onPress={handleNext} style={[styles.navBtn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.text }}>Next →</Text>
          </Pressable>
        </View>

        {/* Top Artists Preview */}
        {stats.topArtists.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>YOUR TOP 5</Text>
            <View style={[styles.topList, { backgroundColor: colors.card }]}>
              {stats.topArtists.slice(0, 5).map((artist, i) => (
                <View key={artist.name} style={[styles.topItem, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.topRank, { color: colors.primary }]}>#{i + 1}</Text>
                  <View style={styles.topInfo}>
                    <Text style={[styles.topName, { color: colors.text }]}>{artist.name}</Text>
                    <Text style={[styles.topCount, { color: colors.textSecondary }]}>
                      {artist.count} plays
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

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
  subtitle: { fontSize: fontSize.sm, marginTop: spacing.xs },
  content: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.lg },
  cardContainer: { marginBottom: spacing.lg },
  card: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl, borderRadius: radius.lg, borderWidth: 2, alignItems: 'center', justifyContent: 'center', minHeight: 240 },
  cardTitle: { fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },
  cardContent: { fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.md, textAlign: 'center' },
  cardStat: { fontSize: fontSize.sm, textAlign: 'center' },
  navigation: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  navBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  dots: { flexDirection: 'row', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.xs },
  topList: { borderRadius: radius.md, overflow: 'hidden' },
  topItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1 },
  topRank: { fontSize: fontSize.lg, fontWeight: '700', marginRight: spacing.md, minWidth: 30 },
  topInfo: { flex: 1 },
  topName: { fontSize: fontSize.md, fontWeight: '600' },
  topCount: { fontSize: fontSize.sm, marginTop: spacing.xs },
});
