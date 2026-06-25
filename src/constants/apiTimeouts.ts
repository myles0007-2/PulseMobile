/**
 * Three-tier API timeout configuration
 * Used for YouTube Music → Invidious → Piped fallback strategy
 * Each tier has different response characteristics and timeout tolerance
 */

// YouTube Music official API: faster, more reliable
export const YOUTUBE_MUSIC_TIMEOUT_MS = 3000; // 3 seconds

// Invidious free instances: moderate speed, variable reliability
export const INVIDIOUS_TIMEOUT_MS = 4000; // 4 seconds

// Piped alternative instances: slower, fallback-only
export const PIPED_TIMEOUT_MS = 5000; // 5 seconds

// OAuth token refresh: critical operation, needs extra time
export const OAUTH_TOKEN_REFRESH_TIMEOUT_MS = 6000; // 6 seconds

// Search operations: user-visible latency matters
export const SEARCH_TIMEOUT_MS = 3500; // 3.5 seconds

// Library scanning: background operation, can be slower
export const LIBRARY_SCAN_TIMEOUT_MS = 30000; // 30 seconds

// Download operations: large files, slow networks
export const DOWNLOAD_TIMEOUT_MS = 60000; // 60 seconds
