import { useEffect, useRef, useCallback } from 'react';

/**
 * useDebounce: Debounces a callback function
 *
 * @param callback - Function to debounce
 * @param delay - Delay in milliseconds (default: 500ms)
 *
 * Example:
 *   const debouncedSearch = useDebounce((query) => {
 *     console.log('Searching for:', query);
 *   }, 500);
 *
 *   // In component:
 *   const handleSearch = (text) => {
 *     debouncedSearch(text); // Called multiple times, executes once after 500ms
 *   };
 */
export function useDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number = 500
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedCallback = useCallback(
    (...args: any[]) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback as T;
}

/**
 * Debounce: Utility function version (for non-React usage)
 *
 * Example:
 *   const debouncedSearch = debounce((query) => {
 *     console.log('Searching:', query);
 *   }, 500);
 *
 *   textInput.onChange((e) => debouncedSearch(e.target.value));
 */
export function debounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number = 500
): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return ((...args: any[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      callback(...args);
    }, delay);
  }) as T;
}
