/**
 * Animation utilities for Phase 7: Micro-interactions
 *
 * Provides reusable animation definitions for:
 * - Play button bloom
 * - Skip button scale feedback
 * - Card transitions
 * - Theme fades
 */

import { Animated } from 'react-native';

/**
 * Create a bloom animation (scale + fade out)
 * Used for play button feedback
 */
export function createBloomAnimation(): Animated.Value {
  return new Animated.Value(1);
}

export function triggerBloomAnimation(value: Animated.Value): void {
  value.setValue(1);
  Animated.sequence([
    Animated.parallel([
      Animated.timing(value, {
        toValue: 1.3,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(value, {
        toValue: 0.5,
        duration: 200,
        useNativeDriver: false,
      }),
    ]),
    Animated.timing(value, {
      toValue: 1,
      duration: 100,
      useNativeDriver: false,
    }),
  ]).start();
}

/**
 * Create a scale-bounce animation
 * Used for skip button feedback
 */
export function createScaleBounceAnimation(): Animated.Value {
  return new Animated.Value(1);
}

export function triggerScaleBounce(value: Animated.Value): void {
  value.setValue(1);
  Animated.sequence([
    Animated.timing(value, {
      toValue: 0.9,
      duration: 100,
      useNativeDriver: false,
    }),
    Animated.spring(value, {
      toValue: 1,
      friction: 5,
      useNativeDriver: false,
    }),
  ]).start();
}

/**
 * Create a slide-in animation
 * Used for queue/playlist transitions
 */
export function createSlideAnimation(): Animated.Value {
  return new Animated.Value(100);
}

export function triggerSlideIn(value: Animated.Value): void {
  value.setValue(100);
  Animated.timing(value, {
    toValue: 0,
    duration: 300,
    useNativeDriver: true,
  }).start();
}

/**
 * Create a fade animation
 * Used for theme transitions
 */
export function createFadeAnimation(): Animated.Value {
  return new Animated.Value(1);
}

export function triggerFadeOut(value: Animated.Value, callback?: () => void): void {
  Animated.timing(value, {
    toValue: 0.5,
    duration: 200,
    useNativeDriver: false,
  }).start(callback);
}

export function triggerFadeIn(value: Animated.Value): void {
  value.setValue(0.5);
  Animated.timing(value, {
    toValue: 1,
    duration: 200,
    useNativeDriver: false,
  }).start();
}

/**
 * Debounce animation (prevent rapid re-triggering)
 */
export class AnimationDebounce {
  private isAnimating = false;
  private timeout: NodeJS.Timeout | null = null;

  trigger(animationFn: () => void, debounceMs: number = 200): void {
    if (this.isAnimating) return;

    this.isAnimating = true;
    animationFn();

    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      this.isAnimating = false;
    }, debounceMs);
  }

  cleanup(): void {
    if (this.timeout) clearTimeout(this.timeout);
  }
}
