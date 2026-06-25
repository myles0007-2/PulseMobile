import React, { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, Text, Pressable, ScrollView, AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { AppNavigator } from './src/navigation/AppNavigator';
import { CertExpiryBanner } from './src/components/CertExpiryBanner';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { player } from './src/services/audioPlayer';
import { downloadManager } from './src/services/downloadManager';
import { useStore, useColors } from './src/store/useStore';
import { themes } from './src/theme';
import { installCrashReporter, getLastCrash, clearLastCrash, CrashRecord } from './src/services/crashReporter';

// Install the global JS error handler at module-eval time, before ANY rendering,
// so even an early crash is captured and surfaced on the next launch.
installCrashReporter();

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
  const bootstrap = useStore((s) => s.bootstrap);
  const colors = useColors();
  const persistRef = useRef<() => Promise<void>>();
  const appStateRef = useRef(AppState.currentState);
  const [lastCrash, setLastCrash] = useState<CrashRecord | null>(null);

  useEffect(() => {
    persistRef.current = useStore.getState()._persist;
  }, []);

  // Surface any crash captured on the previous launch, then clear it.
  useEffect(() => {
    getLastCrash().then((crash) => {
      if (crash) {
        setLastCrash(crash);
        clearLastCrash();
      }
    });
  }, []);

  // CRASH FIX: Wrap bootstrap and player.init in try-catch with error recovery
  useEffect(() => {
    let isMounted = true;

    const initializeApp = async () => {
      try {
        console.log('[APP] Initializing audio player...');
        await player.init();

        if (!isMounted) return;

        console.log('[APP] Loading persisted state...');
        await bootstrap();

        if (!isMounted) return;
        console.log('[APP] Initialization complete');
      } catch (error) {
        if (isMounted) {
          console.error('[APP] Init failed:', error instanceof Error ? error.message : String(error));
          // Initialization error will be handled by ErrorBoundary
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

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <CertExpiryBanner />
      <AppNavigator />
      {lastCrash && <LastCrashBanner crash={lastCrash} onDismiss={() => setLastCrash(null)} />}
    </View>
  );
}

export default function App() {
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
});
