// CRITICAL: First line of code to catch any pre-module errors
console.log('[ENTRY] App.tsx loading...');

import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text, Pressable, ScrollView, AppState, AppStateStatus } from 'react-native';
console.log('[ENTRY] React Native core imports complete');

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
console.log('[ENTRY] NetInfo and AsyncStorage imported');

console.log('[APP-BOOTSTRAP] Starting app initialization at', new Date().toISOString());

// CRASH FIX: Import crash reporter FIRST before anything else
import { installCrashReporter, getLastCrash, clearLastCrash, CrashRecord } from './src/services/crashReporter';
console.log('[APP-BOOTSTRAP] crashReporter imported');

try {
  installCrashReporter();
  console.log('[APP-BOOTSTRAP] Crash reporter installed');
} catch (e) {
  console.error('[APP-BOOTSTRAP] installCrashReporter failed:', e instanceof Error ? e.message : String(e));
}

// Import remaining modules with detailed logging
console.log('[APP-BOOTSTRAP] importing AppNavigator...');
import { AppNavigator } from './src/navigation/AppNavigator';
console.log('[APP-BOOTSTRAP] AppNavigator imported');

console.log('[APP-BOOTSTRAP] importing CertExpiryBanner...');
import { CertExpiryBanner } from './src/components/CertExpiryBanner';
console.log('[APP-BOOTSTRAP] CertExpiryBanner imported');

console.log('[APP-BOOTSTRAP] importing ErrorBoundary...');
import { ErrorBoundary } from './src/components/ErrorBoundary';
console.log('[APP-BOOTSTRAP] ErrorBoundary imported');

console.log('[APP-BOOTSTRAP] importing audioPlayer...');
import { player } from './src/services/audioPlayer';
console.log('[APP-BOOTSTRAP] audioPlayer imported');

console.log('[APP-BOOTSTRAP] importing downloadManager...');
import { downloadManager } from './src/services/downloadManager';
console.log('[APP-BOOTSTRAP] downloadManager imported');

console.log('[APP-BOOTSTRAP] importing useStore...');
import { useStore, useColors, registerPlayerCallbacks } from './src/store/useStore';
console.log('[APP-BOOTSTRAP] useStore imported');

console.log('[APP-BOOTSTRAP] importing theme...');
import { themes } from './src/theme';
console.log('[APP-BOOTSTRAP] theme imported');

// CRITICAL: Do NOT access AsyncStorage at module load time—it blocks the main thread
// and can cause silent crashes on iOS. The console.error override is moved to Root useEffect.
const originalError = console.error;
console.log('[APP-BOOTSTRAP] Module eval complete');

// MEMORY FIX: Force garbage collection after module load on low-memory devices
if (global.gc) {
  try {
    global.gc();
    console.log('[APP-BOOTSTRAP] Garbage collection triggered');
  } catch (e) {
    console.log('[APP-BOOTSTRAP] gc() not available (expected)');
  }
}

/**
 * Banner shown on launch when the previous session ended in a fatal JS error.
 * Uses hardcoded colors so it renders even if the store/theme is the culprit.
 */
function LastCrashBanner({ crash, onDismiss }: { crash: CrashRecord; onDismiss: () => void }) {
  return (
    <View style={styles.crashBanner}>
      <ScrollView style={{ maxHeight: 180 }}>
        <Text style={styles.crashTitle}>⚠️ Previous launch crashed</Text>
        <Text selectable style={styles.crashMsg}>{crash.name}: {crash.message}</Text>
        {!!crash.stack && (
          <Text selectable style={styles.crashStack}>{crash.stack.slice(0, 800)}</Text>
        )}
      </ScrollView>
      <Pressable onPress={onDismiss} style={styles.crashDismiss}>
        <Text style={styles.crashDismissText}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

function Root() {
  console.log('[Root] Initializing...');
  const bootstrap = useStore((s) => s.bootstrap);
  const colors = useColors();
  console.log('[Root] Hooks initialized successfully');
  const persistRef = useRef<() => Promise<void>>();
  const appStateRef = useRef(AppState.currentState);
  const [lastCrash, setLastCrash] = useState<CrashRecord | null>(null);
  const [debugErrors, setDebugErrors] = useState<any[]>([]);

  // CRASH FIX: Install console.error override in useEffect (not at module load)
  // so AsyncStorage access doesn't block the main thread during app startup
  useEffect(() => {
    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      try {
        const msg = args.map((a) => (a instanceof Error ? a.stack : String(a))).join('\n');
        AsyncStorage.getItem('_debug_errors')
          .then((e: string | null) => {
            const errors = e ? JSON.parse(e) : [];
            errors.push({ time: new Date().toISOString(), msg });
            return AsyncStorage.setItem('_debug_errors', JSON.stringify(errors.slice(-20)));
          })
          .catch(() => {});
      } catch {}
    };
  }, []);

  useEffect(() => {
    persistRef.current = useStore.getState()._persist;
  }, []);

  // Surface any crash captured on the previous launch, then clear it.
  // Also check for debug errors logged during the session.
  // Also check for ErrorBoundary errors from the previous crash.
  useEffect(() => {
    (async () => {
      const crash = await getLastCrash();
      if (crash) {
        setLastCrash(crash);
        clearLastCrash();
      }
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const errs = await AsyncStorage.getItem('_debug_errors');
        if (errs) setDebugErrors(JSON.parse(errs));

        // CRASH FIX: Also load ErrorBoundary error from previous crash
        const boundaryErr = await AsyncStorage.getItem('_ErrorBoundary_lastError');
        if (boundaryErr) {
          const parsed = JSON.parse(boundaryErr);
          console.log('[Root] Found ErrorBoundary error from previous crash:', parsed);
          // Show as a banner (will be shown in lastCrash if we add it to the record)
          if (!crash) {
            setLastCrash({
              name: parsed.name || 'ErrorBoundary Error',
              message: parsed.message || 'Unknown error in previous session',
              stack: parsed.stack || '',
              isFatal: true,
              timestamp: parsed.timestamp || new Date().toISOString(),
            } as any);
          }
          await AsyncStorage.removeItem('_ErrorBoundary_lastError');
        }
      } catch (e) {
        console.warn('[Root] Failed to load previous errors:', e);
      }
    })();
  }, []);

  // CRASH FIX: Wrap bootstrap and player.init in try-catch with error recovery
  useEffect(() => {
    let isMounted = true;

    const initializeApp = async () => {
      try {
        console.log('[APP] Initializing audio player...');
        try {
          await player.init();
        } catch (playerErr) {
          console.error('[APP] Player init failed:', playerErr instanceof Error ? playerErr.message : String(playerErr));
          throw playerErr;
        }

        if (!isMounted) return;

        console.log('[APP] Registering player callbacks...');
        try {
          registerPlayerCallbacks();
        } catch (cbErr) {
          console.error('[APP] Register callbacks failed:', cbErr instanceof Error ? cbErr.message : String(cbErr));
          throw cbErr;
        }

        if (!isMounted) return;

        console.log('[APP] Loading persisted state...');
        try {
          await bootstrap();
        } catch (bootstrapErr) {
          console.error('[APP] Bootstrap failed:', bootstrapErr instanceof Error ? bootstrapErr.message : String(bootstrapErr));
          throw bootstrapErr;
        }

        if (!isMounted) return;
        console.log('[APP] Initialization complete');
      } catch (error) {
        if (isMounted) {
          console.error('[APP] FATAL: Init failed:', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
          // Store error for display
          try {
            AsyncStorage.setItem('_app_init_error', JSON.stringify({
              name: error instanceof Error ? error.name : 'Unknown',
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : '',
              timestamp: new Date().toISOString(),
            })).catch(() => {});
          } catch {}
        }
      }
    };

    initializeApp();
    return () => {
      isMounted = false;
    };
  }, [bootstrap]);

  // BATTERY & LEAK FIX: AppState listener with proper cleanup and memory safety
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      const isTransitioningToBackground =
        appStateRef.current.match(/inactive|background/) === null &&
        nextAppState.match(/inactive|background/) !== null;

      const isTransitioningToForeground =
        appStateRef.current.match(/inactive|background/) !== null &&
        nextAppState === 'active';

      appStateRef.current = nextAppState;

      if (isTransitioningToBackground) {
        console.log('[APP] Background: pausing downloads, saving state');
        await useStore.getState().pauseAllDownloads?.();

        try {
          if (persistRef.current) {
            await persistRef.current();
          }
        } catch (e) {
          console.warn('[APP] Persist failed on background:', e);
        }
      } else if (isTransitioningToForeground) {
        console.log('[APP] Foreground: resuming operations');
        await useStore.getState().resumeAllDownloads?.();
        useStore.getState().startAutoDownloadPoll?.();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // MEMORY FIX: Post-launch optimization (memory warning handling deferred)
  // iOS memory warnings are not easily accessible from JS—implement after launch if needed

  // EDGE FIX: Network state monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const isConnected = state.isConnected === true;
      console.log('[APP] Network state:', isConnected ? 'connected' : 'disconnected');

      if (!isConnected) {
        await downloadManager.onNetworkLoss();
      } else {
        await downloadManager.onNetworkRestore();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (useStore.getState()._initializationFailed) {
    return (
      <View style={[styles.root, styles.errorContainer, { backgroundColor: colors.bg }]}>
        <ErrorBoundary>
          <View style={styles.errorContent}>
            <StatusBar style="light" />
          </View>
        </ErrorBoundary>
      </View>
    );
  }

  try {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <CertExpiryBanner />
        <AppNavigator />
        {lastCrash && <LastCrashBanner crash={lastCrash} onDismiss={() => setLastCrash(null)} />}
        {debugErrors.length > 0 && (
          <View style={styles.debugBanner}>
            <ScrollView style={{ maxHeight: 150 }}>
              <Text style={styles.debugTitle}>Debug Errors ({debugErrors.length})</Text>
              {debugErrors.map((e, i) => (
                <Text key={i} style={styles.debugText} selectable>
                  {e.time}: {e.msg}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  } catch (e) {
    console.error('[Root] Render error:', e);
    return (
      <View style={[styles.root, { backgroundColor: '#0a0a0a' }]}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ color: '#ff6b6b', fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>
            Root Render Crash
          </Text>
          <Text style={{ color: '#ffffff', fontSize: 12 }} selectable>
            {e instanceof Error ? e.message : String(e)}
          </Text>
          <Text style={{ color: '#b0b0b0', fontSize: 10, marginTop: 10 }} selectable>
            {e instanceof Error ? e.stack : ''}
          </Text>
        </View>
      </View>
    );
  }
}

export default function App() {
  try {
    console.log('[App] Rendering app...');
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <ErrorBoundary>
            <StatusBar style="light" />
            <Root />
          </ErrorBoundary>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  } catch (e) {
    console.error('[App] FATAL RENDER ERROR:', e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    if (e instanceof Error && e.stack) console.error('[App] Stack:', e.stack);

    // Try to save error immediately
    try {
      const msg = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e);
      AsyncStorage.setItem('_app_render_crash', msg).catch(() => {});
    } catch {}

    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', padding: 20 }}>
        <Text style={{ color: '#ff6b6b', fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
          ⚠️ App Render Failed
        </Text>
        <Text style={{ color: '#ffffff', fontSize: 14, marginBottom: 8 }}>
          {e instanceof Error ? e.message : String(e)}
        </Text>
        {e instanceof Error && (
          <Text style={{ color: '#b0b0b0', fontSize: 11, fontFamily: 'monospace' }}>
            {e.stack}
          </Text>
        )}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errorContainer: { justifyContent: 'center', alignItems: 'center' },
  errorContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  crashBanner: {
    position: 'absolute',
    top: 50,
    left: 8,
    right: 8,
    backgroundColor: '#2a1212',
    borderColor: '#ff6b6b',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  crashTitle: { color: '#ff8a8a', fontWeight: 'bold', fontSize: 14, marginBottom: 6 },
  crashMsg: { color: '#ffffff', fontSize: 12, marginBottom: 6 },
  crashStack: { color: '#b0b0b0', fontSize: 10, fontFamily: 'monospace' },
  crashDismiss: {
    marginTop: 8,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#ff6b6b',
    borderRadius: 6,
  },
  crashDismissText: { color: '#0a0a0a', fontWeight: 'bold', fontSize: 12 },
  debugBanner: {
    position: 'absolute',
    bottom: 80,
    left: 8,
    right: 8,
    backgroundColor: '#1a1a2e',
    borderColor: '#16a34a',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  debugTitle: { color: '#86efac', fontWeight: 'bold', fontSize: 12, marginBottom: 6 },
  debugText: { color: '#c6f6d5', fontSize: 10, fontFamily: 'monospace', marginBottom: 3 },
});
