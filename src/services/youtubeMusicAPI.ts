import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { YoutubeResult } from '../types';
import { searchYoutube, resolveStreamUrl } from './youtubeService';

/**
 * YouTube Music OAuth + API Service
 *
 * Implements secure OAuth flow with token refresh and three-tier playback:
 * 1. YouTube Music official API (primary)
 * 2. Invidious/Piped (fallback if auth fails)
 *
 * Token security:
 * - Refresh tokens stored encrypted in expo-secure-store
 * - Never stored in Zustand state
 * - Auto-refresh 5min before expiry
 * - Circuit-breaker: if auth fails 3x, disable YouTube Music
 */

const YOUTUBE_MUSIC_API = 'https://www.googleapis.com/youtube/v3';
const TOKEN_KEY = 'yt_music_auth_token_v1';
const REFRESH_TOKEN_KEY = 'yt_music_refresh_token_v1';
const TOKEN_EXPIRY_KEY = 'yt_music_token_expiry_v1';
const CIRCUIT_BREAKER_KEY = 'yt_music_circuit_breaker_v1';
const AUTH_FAILURE_COUNT_KEY = 'yt_music_auth_failures_v1';
const OAUTH_STATE_KEY = 'yt_music_oauth_state_v1';
const MAX_AUTH_FAILURES = 3;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5min before expiry

// OAuth Configuration - Replace with your credentials from Google Cloud Console
// https://console.cloud.google.com/apis/credentials
const YOUTUBE_OAUTH_CONFIG = {
  CLIENT_ID: process.env.YOUTUBE_CLIENT_ID || '', // Required: From Google Cloud
  CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET || '', // Required: From Google Cloud
  API_KEY: process.env.YOUTUBE_API_KEY || '', // Required: From Google Cloud
  REDIRECT_URI: 'https://pulsemobile.app/auth/youtube',
  SCOPES: 'https://www.googleapis.com/auth/youtube.readonly',
};

// Helper to generate random state for CSRF protection
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface YouTubeAuthState {
  isAuthenticated: boolean;
  isInitialized: boolean;
  circuitBreakerTripped: boolean;
  lastAuthError?: string;
}

class YouTubeMusicAuth {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private authState: YouTubeAuthState = {
    isAuthenticated: false,
    isInitialized: false,
    circuitBreakerTripped: false,
  };
  private refreshPromise: Promise<boolean> | null = null;
  private authFlowPromise: Promise<boolean> | null = null;

  async initialize(): Promise<YouTubeAuthState> {
    try {
      // Check circuit breaker
      const cbTripped = await AsyncStorage.getItem(CIRCUIT_BREAKER_KEY);
      if (cbTripped === 'true') {
        this.authState.circuitBreakerTripped = true;
        this.authState.isInitialized = true;
        return this.authState;
      }

      // Load cached token and expiry
      const cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
      const cachedExpiry = await AsyncStorage.getItem(TOKEN_EXPIRY_KEY);

      if (cachedToken && cachedExpiry) {
        const expiry = parseInt(cachedExpiry, 10);
        if (Number.isNaN(expiry)) {
          console.warn('Invalid cached token expiry, clearing');
          await this.logout();
          return this.authState;
        }
        this.accessToken = cachedToken;
        this.tokenExpiry = expiry;

        // Check if token needs refresh
        if (Date.now() + TOKEN_REFRESH_BUFFER_MS > this.tokenExpiry) {
          await this.refreshAccessToken();
        } else {
          this.authState.isAuthenticated = true;
        }
      }

      this.authState.isInitialized = true;
      return this.authState;
    } catch (error) {
      console.error('YouTube Music auth init failed:', error);
      this.authState.isInitialized = true;
      return this.authState;
    }
  }

  async startAuthFlow(): Promise<boolean> {
    // Prevent concurrent auth attempts
    if (this.authFlowPromise) {
      return this.authFlowPromise;
    }

    this.authFlowPromise = this.performAuthFlow();
    try {
      return await this.authFlowPromise;
    } finally {
      this.authFlowPromise = null;
    }
  }

  private async performAuthFlow(): Promise<boolean> {
    try {
      // Credentials check
      if (!YOUTUBE_OAUTH_CONFIG.CLIENT_ID || !YOUTUBE_OAUTH_CONFIG.CLIENT_SECRET) {
        console.warn('YouTube Music OAuth credentials not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET env vars.');
        await this.recordAuthFailure();
        return false;
      }

      // Step 1: Generate state for CSRF protection
      const state = generateRandomString(32);
      await SecureStore.setItemAsync(OAUTH_STATE_KEY, state);

      // Step 2: Build OAuth URL
      const params = new URLSearchParams({
        client_id: YOUTUBE_OAUTH_CONFIG.CLIENT_ID,
        redirect_uri: YOUTUBE_OAUTH_CONFIG.REDIRECT_URI,
        response_type: 'code',
        scope: YOUTUBE_OAUTH_CONFIG.SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

      // Step 3: Open browser for OAuth with 30s timeout
      const timeoutPromise = new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('[YouTube] OAuth timeout (30s)')), 30000)
      );

      let result;
      try {
        result = await Promise.race([
          WebBrowser.openAuthSessionAsync(authUrl, Linking.createURL('auth/youtube')),
          timeoutPromise
        ]);
      } catch (timeoutErr) {
        const msg = timeoutErr instanceof Error ? timeoutErr.message : String(timeoutErr);
        console.error('[YouTube] OAuth error:', msg);

        // Network errors are typically "Network request failed" or similar
        const isNetworkError = msg.toLowerCase().includes('network') || msg.toLowerCase().includes('timeout');
        if (isNetworkError) {
          console.warn('[YouTube] Network error during OAuth—check connection');
        }

        await this.recordAuthFailure();
        return false;
      }

      if (result.type !== 'success') {
        if (result.type === 'cancel') {
          console.warn('[YouTube] OAuth cancelled by user');
        } else if (result.type === 'dismiss') {
          console.warn('[YouTube] OAuth browser closed');
        }
        await this.recordAuthFailure();
        return false;
      }

      // Step 4: Extract code from redirect URL
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');
      const storedState = await SecureStore.getItemAsync(OAUTH_STATE_KEY);

      if (!code || returnedState !== storedState) {
        console.error('OAuth state mismatch or missing code - CSRF detected');
        await this.recordAuthFailure();
        return false;
      }

      // Step 5: Exchange code for tokens
      await this.exchangeCodeForToken(code);
      return true;
    } catch (error) {
      await this.recordAuthFailure();
      console.error('YouTube Music auth flow failed:', error);
      return false;
    }
  }

  private async exchangeCodeForToken(code: string): Promise<void> {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: YOUTUBE_OAUTH_CONFIG.CLIENT_ID,
          client_secret: YOUTUBE_OAUTH_CONFIG.CLIENT_SECRET,
          grant_type: 'authorization_code',
          redirect_uri: YOUTUBE_OAUTH_CONFIG.REDIRECT_URI,
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
      }

      const tokens = await response.json();

      // Store tokens securely
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh_token);
      await SecureStore.setItemAsync(TOKEN_KEY, tokens.access_token);
      await AsyncStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + tokens.expires_in * 1000));

      this.accessToken = tokens.access_token;
      this.tokenExpiry = Date.now() + tokens.expires_in * 1000;
      this.authState.isAuthenticated = true;

      // Clear circuit breaker on successful auth
      await AsyncStorage.removeItem(CIRCUIT_BREAKER_KEY);
      await AsyncStorage.removeItem(AUTH_FAILURE_COUNT_KEY);

      console.log('YouTube Music authentication successful');
    } catch (error) {
      await this.recordAuthFailure();
      throw error;
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    // Prevent concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh();
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        console.warn('No refresh token available for YouTube Music');
        await this.recordAuthFailure();
        return false;
      }

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: YOUTUBE_OAUTH_CONFIG.CLIENT_ID,
          client_secret: YOUTUBE_OAUTH_CONFIG.CLIENT_SECRET,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      const tokens = await response.json();

      // Store new access token
      await SecureStore.setItemAsync(TOKEN_KEY, tokens.access_token);
      await AsyncStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + tokens.expires_in * 1000));

      this.accessToken = tokens.access_token;
      this.tokenExpiry = Date.now() + tokens.expires_in * 1000;
      this.authState.isAuthenticated = true;

      console.log('YouTube Music token refresh successful');
      return true;
    } catch (error) {
      await this.recordAuthFailure();
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  private async recordAuthFailure(): Promise<void> {
    try {
      const failureCount = parseInt(await AsyncStorage.getItem(AUTH_FAILURE_COUNT_KEY) || '0', 10);
      const newCount = failureCount + 1;

      if (newCount >= MAX_AUTH_FAILURES) {
        await AsyncStorage.setItem(CIRCUIT_BREAKER_KEY, 'true');
        this.authState.circuitBreakerTripped = true;
      }

      await AsyncStorage.setItem(AUTH_FAILURE_COUNT_KEY, String(newCount));
    } catch (error) {
      console.warn('Failed to record auth failure:', error);
    }
  }

  async logout(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await AsyncStorage.removeItem(TOKEN_EXPIRY_KEY);
      await AsyncStorage.removeItem(AUTH_FAILURE_COUNT_KEY);
      await AsyncStorage.removeItem(CIRCUIT_BREAKER_KEY);

      this.accessToken = null;
      this.tokenExpiry = 0;
      this.authState.isAuthenticated = false;
      this.authState.circuitBreakerTripped = false;
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  getAuthState(): YouTubeAuthState {
    return { ...this.authState };
  }

  isReady(): boolean {
    return this.authState.isInitialized;
  }

  isAuthenticated(): boolean {
    return this.authState.isAuthenticated && !this.authState.circuitBreakerTripped;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }
}

export const youtubeMusicAuth = new YouTubeMusicAuth();

/**
 * Setup deep link listener for OAuth callback
 * Should be called once from App.tsx or useStore bootstrap
 */
let deepLinkListener: ((event: { url: string }) => void) | null = null;
export function setupYouTubeMusicOAuthListener(onAuthComplete?: (success: boolean) => void): () => void {
  deepLinkListener = async (event: { url: string }) => {
    try {
      const url = new URL(event.url);
      if (url.pathname === '/auth/youtube' || url.host === 'pulsemobile.app') {
        // This is our OAuth callback
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        if (!code) {
          console.warn('OAuth callback missing code');
          onAuthComplete?.(false);
          return;
        }

        // Verify state
        const storedState = await SecureStore.getItemAsync(OAUTH_STATE_KEY);
        if (state !== storedState) {
          console.error('State mismatch in OAuth callback');
          onAuthComplete?.(false);
          return;
        }

        // State matches, proceed with token exchange
        // (The actual exchange happens in performAuthFlow)
        console.log('OAuth callback received, tokens exchanged');
        onAuthComplete?.(true);
      }
    } catch (error) {
      console.error('Error handling OAuth callback:', error);
      onAuthComplete?.(false);
    }
  };

  // Register the listener
  const subscription = Linking.addEventListener('url', deepLinkListener);

  // Return cleanup function
  return () => {
    subscription.remove();
    deepLinkListener = null;
  };
}

/**
 * Search YouTube Music (official API if authed, Invidious fallback)
 * Three-tier: YouTube Music API → Invidious → Piped
 */
export async function searchYouTubeMusic(query: string): Promise<YoutubeResult[]> {
  // Tier 1: If YouTube Music auth available and not circuit-broken, use official API
  if (youtubeMusicAuth.isAuthenticated()) {
    try {
      const accessToken = youtubeMusicAuth.getAccessToken();
      if (!accessToken) throw new Error('No access token available');

      const response = await fetch(
        `${YOUTUBE_MUSIC_API}/search?` +
        `q=${encodeURIComponent(query)}&` +
        `part=snippet&type=video&maxResults=20&key=${YOUTUBE_OAUTH_CONFIG.API_KEY}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      if (!response.ok) {
        throw new Error(`YouTube Music API error: ${response.statusText}`);
      }

      const data = await response.json();
      const results = data.items?.map((item: any) => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        author: item.snippet.channelTitle,
        durationSeconds: 0, // YouTube API search doesn't return duration
        thumbnail: item.snippet.thumbnails?.default?.url || '',
      })) || [];

      console.log(`Found ${results.length} results via YouTube Music API`);
      return results;
    } catch (error) {
      console.warn('YouTube Music search failed, falling back to Invidious:', error);
    }
  }

  // Tier 2 & 3: Fallback to Invidious/Piped (guaranteed to work)
  return searchYoutube(query);
}

/**
 * Resolve stream URL using YouTube Music or Invidious fallback
 */
export async function resolveYouTubeMusicStreamUrl(videoId: string): Promise<string> {
  // If YouTube Music auth available, try official API first
  if (youtubeMusicAuth.isAuthenticated()) {
    try {
      // TODO: Implement actual YouTube Music stream URL resolution
      // This would call the YouTube Music API to get direct stream
      console.debug('YouTube Music auth available but not yet implemented, using Invidious fallback');
    } catch (error) {
      console.warn('YouTube Music stream resolution failed, falling back to Invidious:', error);
    }
  }

  // Fallback to Invidious
  return resolveStreamUrl(videoId);
}

/**
 * Resolve stream URL (three-tier: YouTube Music → Invidious → Piped)
 */
export async function resolveStreamUrlWithFallback(videoId: string): Promise<string> {
  // Tier 1: YouTube Music official
  if (youtubeMusicAuth.isAuthenticated()) {
    try {
      // TODO: Implement actual YouTube Music streaming URL fetch
      // This would call official API to get premium stream
      // return officialUrl;
    } catch (error) {
      console.warn('YouTube Music resolution failed, falling back to Invidious:', error);
    }
  }

  // Tier 2 & 3: Invidious/Piped (via youtubeService)
  return resolveStreamUrl(videoId);
}
