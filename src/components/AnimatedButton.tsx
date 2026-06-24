import React, { useRef, useEffect } from 'react';
import { Pressable, Animated, StyleSheet } from 'react-native';
import { createScaleBounceAnimation, triggerScaleBounce } from '../utils/animations';

interface AnimatedButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
  feedbackType?: 'bounce' | 'none';
  disabled?: boolean;
  hitSlop?: number;
}

/**
 * AnimatedButton: Button with micro-interaction feedback
 *
 * Usage:
 * <AnimatedButton onPress={() => play()} feedbackType="bounce">
 *   <PlayIcon />
 * </AnimatedButton>
 */
export function AnimatedButton({
  onPress,
  children,
  style,
  feedbackType = 'bounce',
  disabled = false,
  hitSlop = 8,
}: AnimatedButtonProps) {
  const scaleValue = useRef(createScaleBounceAnimation()).current;

  const handlePress = () => {
    if (feedbackType === 'bounce' && !disabled) {
      triggerScaleBounce(scaleValue);
    }
    onPress();
  };

  const animatedStyle = feedbackType === 'bounce' ? {
    transform: [{ scale: scaleValue }],
  } : {};

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable onPress={handlePress} disabled={disabled} hitSlop={hitSlop}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({});
