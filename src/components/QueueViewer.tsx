import React from 'react';
import { View, Text, FlatList, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Track } from '../types';
import { useColors } from '../store/useStore';
import { spacing, fontSize, radius } from '../theme';

interface QueueViewerProps {
  visible: boolean;
  queue: Track[];
  currentIndex: number;
  onClose: () => void;
  onSelectTrack: (index: number) => void;
}

const QueueViewerComponent: React.FC<QueueViewerProps> = ({
  visible,
  queue,
  currentIndex,
  onClose,
  onSelectTrack,
}) => {
  const colors = useColors();

  const renderQueueItem = ({ item, index }: { item: Track; index: number }) => {
    const isNow = index === currentIndex;
    const isNext = index === currentIndex + 1;

    return (
      <Pressable
        style={[
          styles.queueItem,
          isNow && { backgroundColor: colors.primary + '22' },
          { borderBottomColor: colors.border },
        ]}
        onPress={() => onSelectTrack(index)}
        accessibilityLabel={`${item.title} by ${item.artist}, track ${index + 1}${isNow ? ', now playing' : isNext ? ', next' : ''}`}
        accessibilityRole="radio"
        accessibilityState={{ selected: isNow }}
      >
        <View style={styles.queueItemContent}>
          <Text style={[styles.queueIndex, { color: isNow ? colors.primary : colors.textMuted }]}>
            {index + 1}
          </Text>
          <View style={styles.queueItemInfo}>
            <Text
              style={[styles.queueTitle, { color: isNow ? colors.primary : colors.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={[styles.queueArtist, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.artist}
            </Text>
          </View>
          {isNow && <Ionicons name="play" size={16} color={colors.primary} />}
          {isNext && <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm }}>Next</Text>}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Header */}
        <View
          style={[
            styles.header,
            { backgroundColor: colors.surface, borderBottomColor: colors.border },
          ]}
        >
          <Text style={[styles.headerTitle, { color: colors.text }]}>Queue ({queue.length})</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close queue" accessibilityRole="button">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Queue List with PERF optimizations for large queues */}
        <FlatList
          data={queue}
          renderItem={renderQueueItem}
          keyExtractor={(item, index) => `queue-item-${currentIndex}-${index}-${item.id}`}
          contentContainerStyle={{ paddingBottom: 100 }}
          maxToRenderPerBatch={50}
          updateCellsBatchingPeriod={50}
          initialNumToRender={20}
          removeClippedSubviews
        />
      </View>
    </Modal>
  );
};

export const QueueViewer = React.memo(QueueViewerComponent);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    minHeight: 56,
  },
  queueItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  queueIndex: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    width: 24,
    textAlign: 'center',
  },
  queueItemInfo: {
    flex: 1,
  },
  queueTitle: {
    fontSize: fontSize.md,
    fontWeight: '500',
    marginBottom: 2,
  },
  queueArtist: {
    fontSize: fontSize.sm,
  },
});
