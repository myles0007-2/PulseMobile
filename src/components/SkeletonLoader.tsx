import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useColors } from '../store/useStore';
import { spacing } from '../theme';

interface SkeletonLoaderProps {
  count?: number;
  height?: number;
  width?: string | number;
}

/**
 * SkeletonLoader: Shows placeholder boxes while content loads
 * Mimics the shape of actual content (e.g., track rows)
 */
export function SkeletonLoader({
  count = 5,
  height = 60,
  width = '100%',
}: SkeletonLoaderProps) {
  const colors = useColors();

  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.skeleton,
            {
              backgroundColor: colors.bgSecondary,
              height,
              width,
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
