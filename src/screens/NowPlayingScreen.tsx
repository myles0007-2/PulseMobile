import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import {
  View, Text, Image, Pressable, StyleSheet, Dimensions,
  Modal, ActivityIndicator, StatusBar, ScrollView, Alert,
} from 'react-native';
// Verified: react-native-reanimated 3.16.1 is compatible with React Native 0.76.5
import Animated, { FadeIn, ZoomIn, useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAsyncDebounce } from '../hooks/useDebounce';
import { useStore, useColors, RepeatMode } from '../store/useStore';
import { spacing, fontSize, radius } from '../theme';
import { QueueViewer } from '../components/QueueViewer';

const { width } = Dimensions.get('window');
const ART_SIZE = Math.min(width - 56, 340);

function fmt(s: number) {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  const minutes = Math.floor(s / 60);
  const seconds = Math.floor(s % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
    queue, currentIndex, playTrack,
    bluetoothState,
  } = useStore();

  const [showQueue, setShowQueue] = useState(false);

  const lyricsScrollRef = useRef<ScrollView>(null);
  const lineHeight = 40;

  // Debounced volume update (100ms) to reduce frame drops during slider drag.
  // useAsyncDebounce is a hook and MUST be called unconditionally at top level —
  // wrapping it in useMemo violates the Rules of Hooks and crashes on re-render.
  const applyVolume = useCallback(async (v: number) => { await setVolume(v); }, [setVolume]);
  const debouncedSetVolume = useAsyncDebounce(applyVolume, 100);

  // Animation state for play button press
  const playBtnScale = useSharedValue(1);

  const playBtnAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playBtnScale.value }],
  }));

  const handlePlayButtonPress = () => {
    playBtnScale.value = withSequence(
      withSpring(0.9, { damping: 10, mass: 0.8 }),
      withSpring(1, { damping: 10, mass: 0.8 })
    );
    togglePlay();
  };

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
        ...(sleepTimerEnd ? [{ text: 'Cancel Timer', style: 'destructive' as const, onPress: () => setSleepTimer(null) }] : []),
        { text: 'Dismiss', style: 'cancel' as const },
      ]
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
            {bluetoothState.isInitialized && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 }}>
                <Ionicons name="bluetooth" size={12} color={colors.primary} />
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '600' }}>BT Controls</Text>
              </View>
            )}
            {!bluetoothState.isInitialized && bluetoothState.errorMessage && (
              <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 2 }}>⚠ BT unavailable</Text>
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
            {/* Album Art - Animated fade in + zoom */}
            <Animated.View
              style={[styles.artWrapper, { entering: ZoomIn.springify().damping(1.5) } as any]}
            >
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
            </Animated.View>

            {/* Track Info - Animated fade in */}
            <Animated.View
              style={[styles.trackRow, { entering: FadeIn.delay(100).duration(300) } as any]}
            >
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
            </Animated.View>
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
              lyrics.map((line, i) => {
                const clampedIndex = Math.max(0, Math.min(currentLyricIndex, lyrics.length - 1));
                return (
                  <Text
                    key={`lyric-${i}-${line.text}`}
                    style={[
                      styles.lyricLine,
                      {
                        color: i === clampedIndex ? colors.text : colors.textMuted,
                        fontSize: i === clampedIndex ? 17 : 15,
                        fontWeight: i === clampedIndex ? '700' : '400',
                        opacity: Math.abs(i - clampedIndex) > 4 ? 0.35 : 1,
                      },
                    ]}
                  >
                    {line.text}
                  </Text>
                );
              })
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
            disabled={!duration || duration <= 0}
            minimumValue={0}
            maximumValue={Math.max(duration, 1)}
            value={duration > 0 ? Math.min(position, duration) : 0}
            onSlidingComplete={(pos) => {
              if (duration > 0) seekTo(Math.min(pos, duration));
            }}
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
          <Pressable
            hitSlop={16}
            onPress={toggleShuffle}
            style={styles.sideCtrl}
            accessibilityLabel={`${shuffle ? 'Shuffle on' : 'Shuffle off'}`}
            accessibilityRole="switch"
            accessibilityState={{ checked: shuffle }}
          >
            <Ionicons
              name={shuffle ? 'shuffle' : 'shuffle-outline'}
              size={22}
              color={shuffle ? colors.primary : colors.textMuted}
            />
          </Pressable>

          <Pressable
            hitSlop={12}
            onPress={prevTrack}
            style={styles.skipBtn}
            accessibilityLabel="Previous track"
            accessibilityRole="button"
          >
            <Ionicons name="play-skip-back" size={30} color={colors.text} />
          </Pressable>

          <Animated.View style={playBtnAnimatedStyle}>
            <Pressable
              style={[styles.playBtn, { backgroundColor: colors.primary }]}
              onPress={handlePlayButtonPress}
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              accessibilityRole="button"
            >
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
          </Animated.View>

          <Pressable
            hitSlop={12}
            onPress={nextTrack}
            style={styles.skipBtn}
            accessibilityLabel="Next track"
            accessibilityRole="button"
          >
            <Ionicons name="play-skip-forward" size={30} color={colors.text} />
          </Pressable>

          <Pressable
            hitSlop={16}
            onPress={() => setRepeat(REPEAT_NEXT[repeat])}
            style={styles.sideCtrl}
            accessibilityLabel={`Repeat: ${repeat === 'none' ? 'off' : repeat === 'all' ? 'all' : 'one'}`}
            accessibilityRole="button"
          >
            <Ionicons name={repeatIcon} size={22} color={repeatColor} />
            {repeat === 'one' && (
              <Text style={[styles.repeatOne, { color: colors.primary }]}>1</Text>
            )}
          </Pressable>
        </View>

        {/* Queue Button */}
        <Pressable
          hitSlop={16}
          onPress={() => setShowQueue(true)}
          style={[styles.queueBtn, { borderColor: colors.border }]}
        >
          <Ionicons name="list" size={20} color={colors.text} />
          <Text style={[styles.queueBtnText, { color: colors.textSecondary }]}>
            {queue.length} in queue
          </Text>
        </Pressable>

        {/* Volume */}
        <View style={styles.volumeRow}>
          <Ionicons name="volume-low-outline" size={18} color={colors.textMuted} />
          <Slider
            style={styles.volumeSlider}
            minimumValue={0}
            maximumValue={1}
            value={volume}
            step={0.01}
            onValueChange={debouncedSetVolume}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.primary}
          />
          <Ionicons name="volume-high-outline" size={18} color={colors.textMuted} />
        </View>

      </View>

      {/* Queue Viewer */}
      <QueueViewer
        visible={showQueue}
        queue={queue}
        currentIndex={currentIndex}
        onClose={() => setShowQueue(false)}
        onSelectTrack={(index) => {
          if (queue[index]) {
            playTrack(queue[index], queue);
            setShowQueue(false);
          }
        }}
      />
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

  queueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  queueBtnText: { fontSize: 13, fontWeight: '600' },
});
