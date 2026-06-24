import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useColors } from '../store/useStore';
import { spacing } from '../theme';

interface SkeletonLoaderProps {
  count?: number;
  height?: number;
  // Width as number (pixels) or pass nothing to stretch full width. Strings like '100%' are handled internally.
  width?: number;
}

/**
 * SkeletonLoader: Shows placeholder boxes while content loads
 * Mimics the shape of actual content (e.g., track rows).
 *
 * Width handling: Pass a number for fixed pixel width, or omit to stretch full width.
 *
 * Example:
 *   <SkeletonLoader count={5} height={60} /> // Stretches full width
 *   <SkeletonLoader count={3} height={40} width={200} /> // Fixed 200px width
 */
export function SkeletonLoader({
  count = 5,
  height = 60,
  width,
}: SkeletonLoaderProps) {
  const colors = useColors();
  const widthStyle = width ? { width } : { alignSelf: 'stretch' as const };

  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.skeleton,
            widthStyle,
            {
              backgroundColor: colors.card,
              height,
              marginBottom: spacing.sm,
            },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * LibrarySkeletonLoader: Skeleton loader specifically for library scanning
 * Shows 8-10 track rows
 */
export function LibrarySkeletonLoader() {
  return <SkeletonLoader count={8} height={64} />;
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  skeleton: {
    borderRadius: 8,
  },
});
