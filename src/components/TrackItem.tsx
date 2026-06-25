import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Track } from '../types';
import { useColors, useStore } from '../store/useStore';
import { spacing, fontSize, radius } from '../theme';
import { getTrackArtwork } from '../services/iosMusicLibrary';
import { DownloadButton } from './DownloadButton';

interface Props {
  track: Track;
  isActive?: boolean;
  onPress: () => void;
  showMenu?: boolean;
  onRemove?: () => void;
}

function formatDuration(s: number): string {
  if (!s) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// Artwork is lazily fetched once per track; cached in a module-level Map so
// the native bridge is only called once per unique track ID per app session.
// In-flight requests are tracked to prevent duplicate concurrent fetches.
const artworkMemCache = new Map<string, string | null>();
const artworkFetchPromises = new Map<string, Promise<string | null>>();

function useLazyArtwork(track: Track): string | undefined {
  const [art, setArt] = useState<string | undefined>(track.artwork);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    // Only fetch for iTunes tracks that have no artwork yet
    if (track.artwork || !track.id.startsWith('mplib::')) return;

    const cached = artworkMemCache.get(track.id);
    if (cached !== undefined) {
      if (cached) setArt(cached);
      return;
    }

    // Small delay so fast-scrolling doesn't fire dozens of bridge calls
    const timer = setTimeout(async () => {
      try {
        // If a fetch for this track is already in flight, reuse it instead of duplicating
        let promise = artworkFetchPromises.get(track.id);
        if (!promise) {
          promise = getTrackArtwork(track.id);
          artworkFetchPromises.set(track.id, promise);
        }
        const result = await promise;
        artworkMemCache.set(track.id, result);
        artworkFetchPromises.delete(track.id);
        if (mounted.current && result) setArt(result);
      } catch (error) {
        artworkFetchPromises.delete(track.id);
      }
    }, 200);

    return () => {
      mounted.current = false;
      clearTimeout(timer);
    };
  }, [track.id]);

  return art;
}

export const TrackItem = React.memo(
  ({ track, isActive, onPress, showMenu = true, onRemove }: Props) => {
    const colors = useColors();
    const isLiked = useStore((s) => s.isLiked(track.id));
    const toggleLike = useStore((s) => s.toggleLike);
    const playlists = useStore((s) => s.playlists);
    const addToPlaylist = useStore((s) => s.addToPlaylist);
    const createPlaylist = useStore((s) => s.createPlaylist);

    const artwork = useLazyArtwork(track);
    const accessibilityLabel = `${track.title} by ${track.artist}${isActive ? ', currently playing' : ''}`;

    const openMenu = useCallback(() => {
      // NOTE: must read via getState() — calling the useStore hook inside an
      // event handler violates the Rules of Hooks and throws at runtime.
      const freshLiked = useStore.getState().isLiked(track.id);
      const { playlists: currentPlaylists, addToPlaylist: add, createPlaylist: create } = useStore.getState();

      const buttons: any[] = [
        { text: freshLiked ? 'Unlike' : 'Like', onPress: () => toggleLike(track) },
        {
          text: 'Add to Playlist',
          onPress: () => {
            if (!currentPlaylists.length) {
              Alert.prompt('New Playlist', 'Name your playlist:', (name) => {
                if (name?.trim()) {
                  create(name.trim());
                  const { playlists: pl } = useStore.getState();
                  if (pl[0]) add(pl[0].id, track);
                }
              });
              return;
            }
            Alert.alert('Add to Playlist', track.title, [
              ...currentPlaylists.map((pl) => ({
                text: pl.name,
                onPress: () => add(pl.id, track),
              })),
              {
                text: '+ New Playlist',
                onPress: () =>
                  Alert.prompt('New Playlist', 'Name:', (name) => {
                    if (name?.trim()) {
                      create(name.trim());
                      const { playlists: fresh } = useStore.getState();
                      const newest = fresh[fresh.length - 1];
                      if (newest) add(newest.id, track);
                    }
                  }),
              },
              { text: 'Cancel', style: 'cancel' },
            ]);
          },
        },
      ];
      if (onRemove) buttons.push({ text: 'Remove', style: 'destructive', onPress: onRemove });
      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert(track.title, track.artist, buttons);
    }, [track, toggleLike, onRemove]);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          pressed && styles.pressed,
          isActive && styles.active,
        ]}
        onPress={onPress}
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        {artwork ? (
          <Image source={{ uri: artwork }} style={styles.art} />
        ) : (
          <View style={styles.artPlaceholder}>
            <Ionicons name="musical-note" size={18} color="#666" />
          </View>
        )}

        <View style={styles.info}>
          <Text
            style={[styles.title, isActive && styles.titleActive, { color: isActive ? undefined : colors.text }]}
            numberOfLines={1}
          >
            {track.title}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {track.artist}
            {track.album && track.album !== 'Unknown Album' ? ` · ${track.album}` : ''}
          </Text>
        </View>

        <Text style={[styles.duration, { color: colors.textMuted }]}>
          {formatDuration(track.duration)}
        </Text>

        {isLiked && (
          <Ionicons name="heart" size={13} color={colors.primary} style={styles.heart} />
        )}

        <DownloadButton track={track} size="small" />

        {showMenu && (
          <Pressable hitSlop={12} onPress={openMenu} style={styles.menuBtn}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </Pressable>
    );
  },
  (prev, next) =>
    prev.track.id === next.track.id &&
    prev.isActive === next.isActive &&
    prev.track.artwork === next.track.artwork &&
    prev.onPress === next.onPress &&
    prev.showMenu === next.showMenu &&
    prev.onRemove === next.onRemove
);

// Static styles — created ONCE, not on every render
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 64,
  },
  pressed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  active: { backgroundColor: 'rgba(124,58,237,0.1)' },
  art: { width: 48, height: 48, borderRadius: radius.sm, marginRight: spacing.sm },
  artPlaceholder: {
    width: 48, height: 48, borderRadius: radius.sm, marginRight: spacing.sm,
    backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1, marginRight: spacing.xs },
  title: { fontSize: fontSize.md, fontWeight: '500' },
  titleActive: { color: '#7c3aed' },
  sub: { fontSize: fontSize.sm, marginTop: 2 },
  duration: { fontSize: fontSize.xs, marginRight: spacing.xs },
  heart: { marginLeft: 4 },
  menuBtn: { paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
});
