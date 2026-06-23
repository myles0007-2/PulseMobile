import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors } from '../store/useStore';
import { radius } from '../theme';

export function MiniPlayer() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { currentTrack, isPlaying, isLoading, position, duration, togglePlay, setShowNowPlaying, nextTrack } = useStore();

  if (!currentTrack) return null;

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.card, paddingBottom: insets.bottom > 0 ? insets.bottom / 2 : 8 }]}>
      {/* Thin progress bar at top edge */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
      </View>

      <Pressable style={styles.row} onPress={() => setShowNowPlaying(true)}>
        {/* Artwork */}
        {currentTrack.artwork ? (
          <Image source={{ uri: currentTrack.artwork }} style={[styles.art, { borderRadius: radius.sm }]} />
        ) : (
          <View style={[styles.art, styles.artFallback, { backgroundColor: colors.surface, borderRadius: radius.sm }]}>
            <Ionicons name="musical-note" size={16} color={colors.textMuted} />
          </View>
        )}

        {/* Track info */}
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{currentTrack.title}</Text>
          <Text style={[styles.artist, { color: colors.textSecondary }]} numberOfLines={1}>{currentTrack.artist}</Text>
        </View>

        {/* Play/pause */}
        <Pressable
          hitSlop={16}
          style={styles.btn}
          onPress={(e) => { e.stopPropagation(); togglePlay(); }}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color={colors.text}
              style={{ marginLeft: isPlaying ? 0 : 2 }}
            />
          )}
        </Pressable>

        {/* Next track */}
        <Pressable
          hitSlop={16}
          style={styles.btn}
          onPress={(e) => { e.stopPropagation(); nextTrack(); }}
        >
          <Ionicons name="play-skip-forward" size={22} color={colors.text} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  progressTrack: {
    height: 2,
    width: '100%',
  },
  progressFill: {
    height: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    minHeight: 60,
  },
  art: { width: 42, height: 42, marginRight: 12 },
  artFallback: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700' },
  artist: { fontSize: 12, marginTop: 2 },
  btn: { paddingHorizontal: 10, minWidth: 40, alignItems: 'center' },
});
