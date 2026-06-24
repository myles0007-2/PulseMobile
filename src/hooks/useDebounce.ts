import { useEffect, useRef, useCallback } from 'react';

/**
 * useDebounce: Debounces a callback function
 *
 * @param callback - Function to debounce. MUST be wrapped in useCallback to prevent re-debouncing on every render.
 * @param delay - Delay in milliseconds (default: 500ms)
 *
 * IMPORTANT: Wrap your callback in useCallback() to prevent dependency array re-triggers:
 *   const debouncedSearch = useDebounce(useCallback((query) => {
 *     console.log('Searching for:', query);
 *   }, []), 500);
 *
 * Without useCallback, a new callback reference on every render resets the debounce timer.
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
  const isMountedRef = useRef(true);

  const debouncedCallback = useCallback(
    (...args: any[]) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          callback(...args);
        }
      }, delay);
    },
    [callback, delay]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback as T;
}

/**
 * useAsyncDebounce: Debounces an async callback function
 *
 * @param callback - Async function to debounce (must return Promise<void>)
 * @param delay - Delay in milliseconds (default: 500ms)
 *
 * Wraps the async callback in a wrapper that returns Promise<void>. Debounce waits for the delay
 * before executing the async function. Subsequent calls within the delay reset the timer.
 *
 * Example:
 *   const debouncedSearch = useAsyncDebounce(async (query) => {
 *     const results = await fetchSearchResults(query);
 *     setResults(results);
 *   }, 500);
 *
 *   // In component:
 *   const handleSearch = async (text) => {
 *     await debouncedSearch(text);
 *   };
 */
export function useAsyncDebounce<T extends (...args: any[]) => Promise<void>>(
  callback: T,
  delay: number = 500
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const debouncedCallback = useCallback(
    async (...args: any[]) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      return new Promise<void>((resolve) => {
        timeoutRef.current = setTimeout(async () => {
          if (isMountedRef.current) {
            await callback(...args);
          }
          resolve();
        }, delay);
      });
    },
    [callback, delay]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
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
