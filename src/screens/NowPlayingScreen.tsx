import React, { useCallback, useRef, useEffect } from 'react';
import {
  View, Text, Image, Pressable, StyleSheet, Dimensions,
  Modal, ActivityIndicator, StatusBar, ScrollView, Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore, useColors, RepeatMode } from '../store/useStore';
import { spacing, fontSize, radius } from '../theme';

const { width } = Dimensions.get('window');
const ART_SIZE = Math.min(width - 56, 340);

function fmt(s: number) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

const REPEAT_NEXT: Record<RepeatMode, RepeatMode> = { none: 'all', all: 'one', one: 'none' };

const SLEEP_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '60 min', value: 60 },
  { label: '90 min', value: 90 },
];

export function NowPlayingScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const {
    currentTrack, isPlaying, isLoading,
    position, duration, volume,
    repeat, shuffle, sleepTimerEnd,
    lyrics, currentLyricIndex, showLyrics, setShowLyrics,
    showNowPlaying, setShowNowPlaying,
    togglePlay, nextTrack, prevTrack, seekTo, setRepeat, toggleShuffle,
    setVolume, setSleepTimer, toggleLike, isLiked,
    sponsorSegments,
  } = useStore();

  const lyricsScrollRef = useRef<ScrollView>(null);
  const lineHeight = 40;

  useEffect(() => {
    if (showLyrics && lyrics.length && lyricsScrollRef.current) {
      lyricsScrollRef.current.scrollTo({
        y: Math.max(0, currentLyricIndex * lineHeight - 120),
        animated: true,
      });
    }
  }, [currentLyricIndex, showLyrics]);

  const openSleepTimer = useCallback(() => {
    const remaining = sleepTimerEnd ? Math.ceil((sleepTimerEnd - Date.now()) / 60000) : null;
    Alert.alert(
      'Sleep Timer',
      remaining ? `Stops in ~${remaining} min` : 'Auto-stop playback after:',
      [
        ...SLEEP_OPTIONS.map((o) => ({
          text: o.label,
          onPress: () => setSleepTimer(o.value),
        })),
        sleepTimerEnd
          ? { text: 'Cancel Timer', style: 'destructive' as const, onPress: () => setSleepTimer(null) }
          : null,
        { text: 'Dismiss', style: 'cancel' as const },
      ].filter(Boolean) as any[]
    );
  }, [sleepTimerEnd, setSleepTimer]);

  if (!currentTrack) return null;

  const liked = isLiked(currentTrack.id);
  const hasSponsor = sponsorSegments.length > 0;
  const repeatIcon = repeat === 'one' ? 'repeat' : 'repeat-outline';
  const repeatColor = repeat !== 'none' ? colors.primary : colors.textMuted;

  return (
    <Modal
      visible={showNowPlaying}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setShowNowPlaying(false)}
    >
      <StatusBar barStyle="light-content" />

      <LinearGradient
        colors={[colors.surface, colors.bg, colors.bg]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      <View style={[styles.container, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>

        {/* Header */}
        <View style={styles.header}>
          <Pressable hitSlop={20} onPress={() => setShowNowPlaying(false)} style={styles.headerBtn}>
            <Ionicons name="chevron-down" size={28} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerLabel, { color: colors.textMuted }]}>NOW PLAYING</Text>
            {hasSponsor && (
              <View style={[styles.sponsorBadge, { backgroundColor: colors.primary + '22' }]}>
                <Text style={[styles.sponsorText, { color: colors.primary }]}>SponsorBlock Active</Text>
              </View>
            )}
          </View>

          <Pressable hitSlop={20} onPress={openSleepTimer} style={styles.headerBtn}>
            <Ionicons
              name={sleepTimerEnd ? 'timer' : 'timer-outline'}
              size={24}
              color={sleepTimerEnd ? colors.primary : colors.textMuted}
            />
          </Pressable>
        </View>

        {!showLyrics ? (
          <>
            {/* Album Art */}
            <View style={styles.artWrapper}>
              {currentTrack.artwork ? (
                <Image
                  source={{ uri: currentTrack.artwork }}
                  style={[styles.art, { borderRadius: radius.lg }]}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.art, styles.artPlaceholder, { backgroundColor: colors.card, borderRadius: radius.lg }]}>
                  <Ionicons name="musical-notes" size={72} color={colors.textMuted} />
                </View>
              )}
            </View>

            {/* Track Info */}
            <View style={styles.trackRow}>
              <View style={styles.trackInfoFlex}>
                <Text style={[styles.trackTitle, { color: colors.text }]} numberOfLines={2}>
                  {currentTrack.title}
                </Text>
                <Text style={[styles.trackArtist, { color: colors.textSecondary }]} numberOfLines={1}>
                  {currentTrack.artist}
                </Text>
              </View>
              <Pressable hitSlop={16} onPress={() => toggleLike(currentTrack)} style={styles.likeBtn}>
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={26}
                  color={liked ? colors.primary : colors.textMuted}
                />
              </Pressable>
            </View>
          </>
        ) : (
          /* Lyrics View */
          <ScrollView
            ref={lyricsScrollRef}
            style={styles.lyricsScroll}
            contentContainerStyle={styles.lyricsContent}
            showsVerticalScrollIndicator={false}
          >
            {lyrics.length === 0 ? (
              <Text style={[styles.noLyrics, { color: colors.textMuted }]}>No lyrics found</Text>
            ) : (
              lyrics.map((line, i) => (
                <Text
                  key={i}
                  style={[
                    styles.lyricLine,
                    {
                      color: i === currentLyricIndex ? colors.text : colors.textMuted,
                      fontSize: i === currentLyricIndex ? 17 : 15,
                      fontWeight: i === currentLyricIndex ? '700' : '400',
                      opacity: Math.abs(i - currentLyricIndex) > 4 ? 0.35 : 1,
                    },
                  ]}
                >
                  {line.text}
                </Text>
              ))
            )}
          </ScrollView>
        )}

        {/* Lyrics toggle */}
        <Pressable style={styles.lyricsToggle} onPress={() => setShowLyrics(!showLyrics)}>
          <Ionicons
            name="text"
            size={13}
            color={showLyrics ? colors.primary : colors.textMuted}
          />
          <Text style={[styles.lyricsToggleText, { color: showLyrics ? colors.primary : colors.textMuted }]}>
            {showLyrics ? 'HIDE LYRICS' : 'LYRICS'}
          </Text>
        </Pressable>

        {/* Progress */}
        <View style={styles.progressBlock}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration || 1}
            value={position}
            onSlidingComplete={seekTo}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary}
          />
          <View style={styles.timeRow}>
            <Text style={[styles.time, { color: colors.textMuted }]}>{fmt(position)}</Text>
            <Text style={[styles.time, { color: colors.textMuted }]}>{fmt(duration)}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <Pressable hitSlop={16} onPress={toggleShuffle} style={styles.sideCtrl}>
            <Ionicons
              name={shuffle ? 'shuffle' : 'shuffle-outline'}
              size={22}
              color={shuffle ? colors.primary : colors.textMuted}
            />
          </Pressable>

          <Pressable hitSlop={12} onPress={prevTrack} style={styles.skipBtn}>
            <Ionicons name="play-skip-back" size={30} color={colors.text} />
          </Pressable>

          <Pressable style={[styles.playBtn, { backgroundColor: colors.primary }]} onPress={togglePlay}>
            {isLoading ? (
              <ActivityIndicator color={colors.bg} size="large" />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={32}
                color={colors.bg}
                style={{ marginLeft: isPlaying ? 0 : 4 }}
              />
            )}
          </Pressable>

          <Pressable hitSlop={12} onPress={nextTrack} style={styles.skipBtn}>
            <Ionicons name="play-skip-forward" size={30} color={colors.text} />
          </Pressable>

          <Pressable hitSlop={16} onPress={() => setRepeat(REPEAT_NEXT[repeat])} style={styles.sideCtrl}>
            <Ionicons name={repeatIcon} size={22} color={repeatColor} />
            {repeat === 'one' && (
              <Text style={[styles.repeatOne, { color: colors.primary }]}>1</Text>
            )}
          </Pressable>
        </View>

        {/* Volume */}
        <View style={styles.volumeRow}>
          <Ionicons name="volume-low-outline" size={18} color={colors.textMuted} />
          <Slider
            style={styles.volumeSlider}
            minimumValue={0}
            maximumValue={1}
            value={volume}
            step={0.01}
            onValueChange={setVolume}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary}
          />
          <Ionicons name="volume-high-outline" size={18} color={colors.textMuted} />
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerBtn: { padding: 4 },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerLabel: { fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  sponsorBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  sponsorText: { fontSize: 10, fontWeight: '600' },

  artWrapper: {
    alignItems: 'center',
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 28,
  },
  art: { width: ART_SIZE, height: ART_SIZE },
  artPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  trackInfoFlex: { flex: 1, marginRight: 12 },
  trackTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, lineHeight: 28 },
  trackArtist: { fontSize: 15, marginTop: 4 },
  likeBtn: { padding: 4 },

  lyricsScroll: { flex: 1 },
  lyricsContent: { paddingVertical: 24, paddingBottom: 40 },
  lyricLine: { textAlign: 'center', marginVertical: 8, lineHeight: 24 },
  noLyrics: { textAlign: 'center', marginTop: 60, fontSize: 15 },

  lyricsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 2,
  },
  lyricsToggleText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },

  progressBlock: { marginBottom: 2 },
  slider: { width: '100%', height: 40 },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
    paddingHorizontal: 2,
  },
  time: { fontSize: 11, fontWeight: '500' },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  sideCtrl: { padding: 8, width: 46, alignItems: 'center', position: 'relative' },
  skipBtn: { padding: 8 },
  playBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  repeatOne: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    fontSize: 9,
    fontWeight: '800',
  },

  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  volumeSlider: { flex: 1, height: 40 },
});
