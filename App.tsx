import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, AppState } from 'react-native';
import { AppNavigator } from './src/navigation/AppNavigator';
import { CertExpiryBanner } from './src/components/CertExpiryBanner';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { player } from './src/services/audioPlayer';
import { useStore, useColors } from './src/store/useStore';

function Root() {
  const bootstrap = useStore((s) => s.bootstrap);
  const persist = useStore((s) => s._persist);
  const colors = useColors();

  useEffect(() => {
    player.init();
    bootstrap();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        persist(); // Save playback state when app suspends
      }
    });
    return () => subscription.remove();
  }, [persist]);

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

const styles = StyleSheet.create({ root: { flex: 1 } });
