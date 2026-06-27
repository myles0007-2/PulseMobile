import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, Alert, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors } from '../store/useStore';
import { TrackItem } from '../components/TrackItem';
import { MiniPlayer } from '../components/MiniPlayer';
import { Playlist } from '../types';
import { spacing, fontSize, radius } from '../theme';
import { batchQueueDownloads } from '../services/batchDownloadService';

export function PlaylistsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { playlists, createPlaylist, deletePlaylist, renamePlaylist, removeFromPlaylist, playTrack, currentTrack } = useStore();
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPlaylist = useCallback(async (pl: Playlist) => {
    if (pl.tracks.length === 0) {
      Alert.alert('Empty Playlist', 'Add tracks to this playlist first.');
      return;
    }
    setIsDownloading(true);
    try {
      await batchQueueDownloads(pl.tracks);
      Alert.alert('Downloaded', `Queued ${pl.tracks.length} songs for download.`);
    } catch (e) {
      Alert.alert('Download Error', 'Failed to queue downloads.');
    } finally {
      setIsDownloading(false);
    }
  }, []);

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createPlaylist(newName.trim());
    setNewName('');
    setShowNewModal(false);
  }, [newName, createPlaylist]);

  const openDeleteMenu = useCallback((pl: Playlist) => {
    Alert.alert(pl.name, `${pl.tracks.length} tracks`, [
      { text: 'Rename', onPress: () => Alert.prompt('Rename', '', (n) => n?.trim() && renamePlaylist(pl.id, n.trim())) },
      { text: 'Delete', style: 'destructive', onPress: () => { deletePlaylist(pl.id); if (activePlaylist?.id === pl.id) setActivePlaylist(null); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [deletePlaylist, renamePlaylist, activePlaylist]);

  // Detail view
  if (activePlaylist) {
    const current = playlists.find((p) => p.id === activePlaylist.id) ?? activePlaylist;
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
        <View style={styles.detailHeader}>
          <Pressable hitSlop={12} onPress={() => setActivePlaylist(null)}>
            <Text style={[styles.back, { color: colors.primary }]}>‹ Playlists</Text>
          </Pressable>
          <Text style={[styles.detailTitle, { color: colors.text }]} numberOfLines={1}>{current.name}</Text>
          <View style={styles.detailActions}>
            {current.tracks.length > 0 && (
              <Pressable
                hitSlop={12}
                onPress={() => handleDownloadPlaylist(current)}
                disabled={isDownloading}
              >
                <Ionicons name={isDownloading ? 'ellipsis-horizontal' : 'download'} size={20} color={colors.primary} />
              </Pressable>
            )}
            <Pressable hitSlop={12} onPress={() => openDeleteMenu(current)}>
              <Text style={{ color: colors.textMuted, fontSize: 22 }}>⋯</Text>
            </Pressable>
          </View>
        </View>

        {current.tracks.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Tap ⋯ on any track and choose "Add to Playlist" to fill this playlist.
            </Text>
          </View>
        ) : (
          <FlatList
            data={current.tracks}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => (
              <TrackItem
                track={item}
                isActive={currentTrack?.id === item.id}
                onPress={() => playTrack(item, current.tracks)}
                onRemove={() => removeFromPlaylist(current.id, item.id)}
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

  // List view
  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Playlists</Text>
        <Pressable style={[styles.newBtn, { backgroundColor: colors.primary }]} onPress={() => setShowNewModal(true)}>
          <Text style={{ color: colors.bg, fontWeight: '700', fontSize: fontSize.sm }}>+ New</Text>
        </Pressable>
      </View>

      {playlists.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ fontSize: 48, marginBottom: spacing.md }}>🎵</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Create playlists to organize your music. Tap "+ New" to start.
          </Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <Pressable style={[styles.playlistRow, { borderBottomColor: colors.border }]} onPress={() => setActivePlaylist(item)}>
              <View style={[styles.playlistIcon, { backgroundColor: colors.primary + '33' }]}>
                <Text style={{ fontSize: 24 }}>🎵</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.plName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.plSub, { color: colors.textSecondary }]}>{item.tracks.length} tracks</Text>
              </View>
              <Pressable hitSlop={12} onPress={() => openDeleteMenu(item)}>
                <Text style={{ color: colors.textMuted, fontSize: 22 }}>⋯</Text>
              </Pressable>
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: 80 }}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          removeClippedSubviews
        />
      )}

      {/* New playlist modal */}
      <Modal visible={showNewModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowNewModal(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.card }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Playlist</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Playlist name"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              onSubmitEditing={handleCreate}
              returnKeyType="done"
            />
            <View style={styles.modalBtns}>
              <Pressable style={[styles.modalBtn, { borderColor: colors.border }]} onPress={() => setShowNewModal(false)}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={handleCreate}>
                <Text style={{ color: colors.bg, fontWeight: '700' }}>Create</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '800' },
  newBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
  playlistRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, minHeight: 64,
  },
  playlistIcon: {
    width: 50, height: 50, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  plName: { fontSize: fontSize.md, fontWeight: '500' },
  plSub: { fontSize: fontSize.sm, marginTop: 2 },
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md,
  },
  back: { fontSize: fontSize.md, fontWeight: '600' },
  detailTitle: { flex: 1, fontSize: fontSize.lg, fontWeight: '700', textAlign: 'center' },
  detailActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  emptyText: { fontSize: fontSize.md, textAlign: 'center', lineHeight: 22 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCard: {
    width: 300, borderRadius: radius.lg, padding: spacing.lg,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '700', marginBottom: spacing.md },
  modalInput: {
    borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: fontSize.md, marginBottom: spacing.md,
  },
  modalBtns: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: {
    flex: 1, alignItems: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.md, borderWidth: 1,
  },
});
