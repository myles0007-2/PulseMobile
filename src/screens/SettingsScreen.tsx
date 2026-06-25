import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors } from '../store/useStore';
import { MiniPlayer } from '../components/MiniPlayer';
import { spacing, fontSize, radius, ThemeName, THEME_LABELS } from '../theme';
import { clearLibraryCache } from '../services/libraryService';
import { downloadManager } from '../services/downloadManager';
import { cacheManager } from '../services/cacheManager';
import { youtubeMusicAuth } from '../services/youtubeMusicAPI';

function Row({ label, value, onPress, danger }: { label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  const colors = useColors();
  return (
    <Pressable style={[styles.row, { borderBottomColor: colors.border }]} onPress={onPress} disabled={!onPress}>
      <Text style={[styles.rowLabel, { color: danger ? colors.danger : colors.text }]}>{label}</Text>
      {value
        ? <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{value}</Text>
        : onPress && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.card }]}>{children}</View>
    </View>
  );
}

const THEMES: ThemeName[] = ['dark', 'midnight', 'forest', 'rose', 'slate', 'amber'];

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { tracks, repeat, shuffle, setRepeat, toggleShuffle, themeName, setTheme, clearHistory, history, autoDownloadEnabled, autoDownloadLikedSongs, wifiOnly, setAutoDownload, setAutoDownloadLikedSongs, setWifiOnly, youtubeAuthenticated, youtubeAuthInitialized, logoutYouTube, initializeYouTubeAuth, eqPreset, setEQPreset } = useStore();
  const [cacheStats, setCacheStats] = useState({ used: 0, limit: 1024 * 1024 * 1024, count: 0 });
  const [downloadSize, setDownloadSize] = useState(0);
  const [youtubeAuthLoading, setYoutubeAuthLoading] = useState(false);

  useEffect(() => {
    const updateStats = async () => {
      const stats = cacheManager.getStats();
      setCacheStats(stats);
      const dlSize = await downloadManager.getDownloadsFolderSize();
      setDownloadSize(dlSize);
    };
    updateStats();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  };

  const clearLibraryCacheUI = () => Alert.alert('Clear Library Cache', 'Force a fresh scan next time you open the Library tab.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => { await clearLibraryCache(); Alert.alert('Done', 'Reopen the Library tab to rescan.'); } },
  ]);

  const clearDownloads = () => Alert.alert('Clear Downloads', `Delete ${formatBytes(downloadSize)} of downloaded songs?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => { await downloadManager.clearAllDownloads(); setDownloadSize(0); } },
  ]);

  const clearCache = () => Alert.alert('Clear Cache', `Delete ${formatBytes(cacheStats.used)} of cached songs?`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: async () => { await cacheManager.clearCache(); setCacheStats({ ...cacheStats, used: 0, count: 0 }); } },
  ]);

  const clearHistoryConfirm = () => Alert.alert('Clear History', 'Remove all play history?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: clearHistory },
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        <Text style={{ fontSize: fontSize.xxl, fontWeight: '800', color: colors.text }}>Settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>

        {/* Theme */}
        <Section title="THEME">
          <View style={styles.themeGrid}>
            {THEMES.map((t) => (
              <Pressable
                key={t}
                style={[styles.themeChip, { borderColor: t === themeName ? colors.primary : colors.border, backgroundColor: t === themeName ? colors.primary + '22' : colors.surface }]}
                onPress={() => setTheme(t)}
              >
                <Text style={{ color: t === themeName ? colors.primary : colors.textSecondary, fontSize: fontSize.sm, fontWeight: t === themeName ? '700' : '400' }}>
                  {THEME_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        {/* Playback */}
        <Section title="PLAYBACK">
          <Pressable style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => {
            const next: any = { none: 'all', all: 'one', one: 'none' };
            setRepeat(next[repeat]);
          }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Repeat</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{repeat === 'none' ? 'Off' : repeat === 'all' ? 'All' : 'One'}</Text>
          </Pressable>
          <Pressable style={[styles.row, { borderBottomColor: colors.border }]} onPress={toggleShuffle}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Shuffle</Text>
            <Text style={[styles.rowValue, { color: shuffle ? colors.primary : colors.textSecondary }]}>{shuffle ? 'On' : 'Off'}</Text>
          </Pressable>
        </Section>

        {/* YouTube Music (Phase 3) */}
        {youtubeAuthInitialized && (
          <Section title="YOUTUBE MUSIC">
            <Pressable style={[styles.row, { borderBottomColor: colors.border }]}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>Status</Text>
              <Text style={[styles.rowValue, { color: youtubeAuthenticated ? colors.primary : colors.textSecondary }]}>
                {youtubeAuthenticated ? '✓ Logged In' : 'Not Connected'}
              </Text>
            </Pressable>
            {!youtubeAuthenticated ? (
              <Pressable
                style={[styles.row, { backgroundColor: colors.primary + '11', justifyContent: 'center', paddingVertical: spacing.md }]}
                onPress={async () => {
                  try {
                    setYoutubeAuthLoading(true);
                    const success = await youtubeMusicAuth.startAuthFlow();
                    if (success) {
                      await initializeYouTubeAuth();
                      Alert.alert('Success', 'YouTube Music connected!');
                    } else {
                      Alert.alert('Error', 'YouTube Music login failed. Falling back to Invidious/Piped.');
                    }
                  } catch (error) {
                    Alert.alert('Error', 'YouTube Music login error');
                    console.error(error);
                  } finally {
                    setYoutubeAuthLoading(false);
                  }
                }}
                disabled={youtubeAuthLoading}
              >
                <Text style={[styles.rowLabel, { color: colors.primary, textAlign: 'center', fontWeight: '600' }]}>
                  {youtubeAuthLoading ? 'Signing in...' : 'Sign in with YouTube Music'}
                </Text>
              </Pressable>
            ) : (
              <Row label="Logout YouTube" onPress={logoutYouTube} danger />
            )}
          </Section>
        )}

        {/* Audio EQ (Phase 4) */}
        <Section title="AUDIO">
          <Pressable style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => {
            const presets = ['flat', 'rock', 'pop', 'podcast'] as const;
            const currentIdx = presets.indexOf(eqPreset);
            const nextIdx = (currentIdx + 1) % presets.length;
            setEQPreset(presets[nextIdx]);
          }}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>EQ Preset</Text>
            <Text style={[styles.rowValue, { color: colors.textSecondary }]}>{eqPreset.charAt(0).toUpperCase() + eqPreset.slice(1)}</Text>
          </Pressable>
        </Section>

        {/* Library */}
        <Section title="LIBRARY">
          <Row label="Total Tracks" value={`${tracks.length}`} />
          <Row label="Play History" value={`${history.length} entries`} />
          <Row label="Clear Play History" onPress={clearHistoryConfirm} danger />
          <Row label="Clear Library Cache" onPress={clearLibraryCacheUI} danger />
        </Section>

        {/* Downloads & Cache */}
        <Section title="DOWNLOADS & CACHE">
          <Row label="Downloads" value={formatBytes(downloadSize)} />
          <Row label="Cache" value={`${formatBytes(cacheStats.used)} / ${formatBytes(cacheStats.limit)}`} />
          <Row label="Cached Files" value={`${cacheStats.count}`} />
          {downloadSize > 0 && <Row label="Clear Downloads" onPress={clearDownloads} danger />}
          {cacheStats.used > 0 && <Row label="Clear Cache" onPress={clearCache} danger />}
        </Section>

        {/* Auto-Download */}
        <Section title="AUTO-DOWNLOAD">
          <Pressable style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => setAutoDownload(!autoDownloadEnabled)}>
            <Text style={[styles.rowLabel, { color: colors.text }]}>Auto-Download Enabled</Text>
            <Text style={[styles.rowValue, { color: autoDownloadEnabled ? colors.primary : colors.textSecondary }]}>{autoDownloadEnabled ? 'On' : 'Off'}</Text>
          </Pressable>
          {autoDownloadEnabled && (
            <>
              <Pressable style={[styles.row, { borderBottomColor: colors.border }]} onPress={() => setAutoDownloadLikedSongs(!autoDownloadLikedSongs)}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Liked Songs</Text>
                <Text style={[styles.rowValue, { color: autoDownloadLikedSongs ? colors.primary : colors.textSecondary }]}>{autoDownloadLikedSongs ? 'Yes' : 'No'}</Text>
              </Pressable>
              <Pressable style={[styles.row]} onPress={() => setWifiOnly(!wifiOnly)}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>WiFi Only</Text>
                <Text style={[styles.rowValue, { color: wifiOnly ? colors.primary : colors.textSecondary }]}>{wifiOnly ? 'Yes' : 'No'}</Text>
              </Pressable>
            </>
          )}
        </Section>

        {/* Transfer */}
        <Section title="TRANSFER 2800+ SONGS">
          <View style={{ padding: spacing.md }}>
            <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.xs }}>Option 1: iTunes File Sharing (Recommended)</Text>
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 }}>
              1. Connect iPhone to PC via USB{'\n'}
              2. Open iTunes → your device → File Sharing{'\n'}
              3. Select PulseMobile{'\n'}
              4. Drag your music folder in{'\n'}
              5. Tap Rescan in the Library tab
            </Text>
            <Text style={{ color: colors.primary, fontSize: fontSize.sm, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.xs }}>Option 2: iOS Music Library (zero transfer)</Text>
            <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 }}>
              If you use iTunes to sync music to your iPhone, tap "Load Music Library" in the Library tab — PulseMobile reads it directly.
            </Text>
          </View>
        </Section>

        {/* About */}
        <Section title="ABOUT">
          <Row label="PulseMobile" value="v1.1.0" />
          <Row label="Features" value="Lyrics · SponsorBlock · Themes" />
        </Section>
      </ScrollView>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg, paddingHorizontal: spacing.md },
  sectionTitle: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.xs, paddingLeft: spacing.xs },
  sectionCard: { borderRadius: radius.md, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderBottomWidth: 1, minHeight: 50 },
  rowLabel: { fontSize: fontSize.md },
  rowValue: { fontSize: fontSize.md },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md },
  themeChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1 },
});
