import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { LibraryScreen } from '../screens/LibraryScreen';
import { LikedSongsScreen } from '../screens/LikedSongsScreen';
import { PlaylistsScreen } from '../screens/PlaylistsScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { OnlineScreen } from '../screens/OnlineScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';
import { WrappedScreen } from '../screens/WrappedScreen';
import { PodcastsScreen } from '../screens/PodcastsScreen';
import { NowPlayingScreen } from '../screens/NowPlayingScreen';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useColors } from '../store/useStore';

const Tab = createBottomTabNavigator();

// Isolate each screen behind its own ErrorBoundary so a crash in one tab shows a
// recovery UI for that tab only, instead of taking down the entire app.
function withErrorBoundary<P extends object>(Comp: React.ComponentType<P>): React.ComponentType<P> {
  return function BoundaryWrapped(props: P) {
    return (
      <ErrorBoundary>
        <Comp {...props} />
      </ErrorBoundary>
    );
  };
}

const SafeLibrary = withErrorBoundary(LibraryScreen);
const SafeLiked = withErrorBoundary(LikedSongsScreen);
const SafePlaylists = withErrorBoundary(PlaylistsScreen);
const SafeHistory = withErrorBoundary(HistoryScreen);
const SafeOnline = withErrorBoundary(OnlineScreen);
const SafePodcasts = withErrorBoundary(PodcastsScreen);
const SafeAnalytics = withErrorBoundary(AnalyticsScreen);
const SafeWrapped = withErrorBoundary(WrappedScreen);
const SafeSettings = withErrorBoundary(SettingsScreen);

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(focused: boolean, name: IoniconsName, outlineName: IoniconsName, color: string) {
  return <Ionicons name={focused ? name : outlineName} size={24} color={color} />;
}

export function AppNavigator() {
  const colors = useColors();

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.bg,
      card: colors.card,
      border: colors.border,
      text: colors.text,
    },
  };

  return (
    <ErrorBoundary>
      <NavigationContainer theme={navTheme}>
        <ErrorBoundary>
          <NowPlayingScreen />
        </ErrorBoundary>
        <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: 'rgba(255,255,255,0.07)',
            borderTopWidth: 1,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 },
        }}
      >
        <Tab.Screen
          name="Library"
          component={SafeLibrary}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'musical-notes', 'musical-notes-outline', color),
          }}
        />
        <Tab.Screen
          name="Liked"
          component={SafeLiked}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'heart', 'heart-outline', color),
          }}
        />
        <Tab.Screen
          name="Playlists"
          component={SafePlaylists}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'list', 'list-outline', color),
          }}
        />
        <Tab.Screen
          name="History"
          component={SafeHistory}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'time', 'time-outline', color),
          }}
        />
        <Tab.Screen
          name="Online"
          component={SafeOnline}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'globe', 'globe-outline', color),
          }}
        />
        <Tab.Screen
          name="Podcasts"
          component={SafePodcasts}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'radio', 'radio-outline', color),
          }}
        />
        <Tab.Screen
          name="Analytics"
          component={SafeAnalytics}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'stats-chart', 'stats-chart-outline', color),
          }}
        />
        <Tab.Screen
          name="Wrapped"
          component={SafeWrapped}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'gift', 'gift-outline', color),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SafeSettings}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'settings', 'settings-outline', color),
          }}
        />
        </Tab.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}
