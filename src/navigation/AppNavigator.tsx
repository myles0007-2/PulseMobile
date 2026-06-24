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
import { NowPlayingScreen } from '../screens/NowPlayingScreen';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useColors } from '../store/useStore';

const Tab = createBottomTabNavigator();

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
        <NowPlayingScreen />
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
          component={LibraryScreen}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'musical-notes', 'musical-notes-outline', color),
          }}
        />
        <Tab.Screen
          name="Liked"
          component={LikedSongsScreen}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'heart', 'heart-outline', color),
          }}
        />
        <Tab.Screen
          name="Playlists"
          component={PlaylistsScreen}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'list', 'list-outline', color),
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'time', 'time-outline', color),
          }}
        />
        <Tab.Screen
          name="Online"
          component={OnlineScreen}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'globe', 'globe-outline', color),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarIcon: ({ focused, color }) => tabIcon(focused, 'settings', 'settings-outline', color),
          }}
        />
        </Tab.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}
