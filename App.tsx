import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { AppNavigator } from './src/navigation/AppNavigator';
import { CertExpiryBanner } from './src/components/CertExpiryBanner';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { player } from './src/services/audioPlayer';
import { downloadManager } from './src/services/downloadManager';
import { useStore, useColors, themes } from './src/store/useStore';

function Root() {
  const bootstrap = useStore((s) => s.bootstrap);
  const colors = useColors();
  const persistRef = useRef<() => Promise<void>>();
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    persistRef.current = useStore.getState()._persist;
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
        useStore.getState().set?.({ _initializationComplete: true });
      } catch (error) {
        if (isMounted) {
          console.error('[APP] Init failed:', error instanceof Error ? error.message : String(error));
          useStore.getState().set?.({
            _initializationFailed: true,
            _initializationError: String(error),
            themeName: 'dark' as const,
            colors: themes.dark,
            tracks: [],
            _isInitialized: false,
          });
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
});
