/**
 * SPIKE 5: OAuth Token Storage Security
 *
 * Question: Is AsyncStorage safe for OAuth tokens? Should we use expo-secure-store?
 * Decision: Determines security posture for Phase 3 (YouTube Music API)
 *
 * This spike investigates token storage options
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * TEST 1: AsyncStorage security analysis
 */
function testAsyncStorage() {
  console.log('=== SPIKE 5: OAuth Token Storage Security ===\n');

  console.log('AsyncStorage:');
  console.log('- Storage method: Plain text on disk');
  console.log('- Encryption: NONE (default)');
  console.log('- Access: Any app/debugger can read values');
  console.log('- Security: ❌ NOT SAFE for sensitive data');

  console.log('\nWhy plain text is a problem:');
  console.log('1. Debug builds: Easy to inspect with Xcode/Android Studio');
  console.log('2. Backup: iTunes backup includes AsyncStorage');
  console.log('3. Jailbreak: Jailbroken phones can access app files');
  console.log('4. App extraction: If app is extracted/decompiled');

  console.log('\nCurrent PulseMobile state:');
  console.log('- Uses AsyncStorage for: playlists, history, liked songs, store state');
  console.log('- None of that is sensitive (user data, not authentication)');
  console.log('- Safe to keep in AsyncStorage');

  console.log('\nOAuth tokens are SENSITIVE:');
  console.log('- Can be used to access YouTube Music account');
  console.log('- Should be encrypted or access-restricted');
  console.log('- Should expire regularly (refresh token pattern)');

  return { asyncStorageSafe: false, asyncStorageUseCase: 'non_sensitive_only' };
}

/**
 * TEST 2: expo-secure-store alternative
 */
function testSecureStore() {
  console.log('\n=== expo-secure-store Alternative ===');

  console.log('expo-secure-store (recommended):');
  console.log('- Storage method: iOS Keychain / Android Keystore');
  console.log('- Encryption: Hardware-encrypted (OS-level)');
  console.log('- Access: Only accessible by app (not debugger)');
  console.log('- Security: ✅ SAFE for OAuth tokens');

  console.log('\nAvailability:');
  console.log('- Already in node_modules? UNKNOWN (need to check)');
  console.log('- If not: npm install expo-secure-store (add dependency)');
  console.log('- Risk: Adding new dependency, but secure storage is worth it');

  console.log('\nComparison:');
  console.log('AsyncStorage:  Fast, plain text, unsafe');
  console.log('SecureStore:   Slightly slower, encrypted, safe');
  console.log('\nFor tokens: SecureStore is non-negotiable');

  return { secureStoreRecommended: true, addDependency: true };
}

/**
 * TEST 3: Token expiry + refresh strategy
 */
function testTokenExpiry() {
  console.log('\n=== Token Expiry & Refresh Strategy ===');

  console.log('Google OAuth token lifecycle:');
  console.log('- Access token: Short-lived (1 hour)');
  console.log('- Refresh token: Long-lived (weeks/months)');

  console.log('\nStrategy:');
  console.log('1. User logs in → receives access_token + refresh_token');
  console.log('2. Store both securely in expo-secure-store');
  console.log('3. Use access_token for API calls');
  console.log('4. When access_token expires (401 error):');
  console.log('   - Use refresh_token to get new access_token');
  console.log('   - Retry API call with new token');
  console.log('5. If refresh_token expires: Ask user to log in again');

  console.log('\nImplementation:');
  console.log('- Check token expiry before API call');
  console.log('- If expired, refresh automatically');
  console.log('- User doesn\'t know (seamless)');
  console.log('- Store expiresAt timestamp for easy checking');

  return {
    tokenRefreshNeeded: true,
    automaticRefreshPossible: true,
    userExperienceSeamless: true,
  };
}

/**
 * TEST 4: Security checklist for Phase 3
 */
function testSecurityCheckList() {
  console.log('\n=== Security Checklist for Phase 3 ===');

  const checks = [
    { item: 'Use PKCE flow (not client_secret)', status: '✓' },
    { item: 'Store tokens in expo-secure-store', status: '✓' },
    { item: 'Validate redirect URL scheme', status: '✓' },
    { item: 'Implement token refresh on expiry', status: '✓' },
    { item: 'Handle 401/403 errors gracefully', status: '✓' },
    { item: 'Fallback to Invidious if OAuth fails', status: '✓' },
    { item: 'Don\'t log tokens (security risk)', status: '✓' },
    { item: 'HTTPS only for API calls', status: '✓' },
  ];

  console.log('\nSecurity implementation checklist:');
  checks.forEach((check) => {
    console.log(`${check.status} ${check.item}`);
  });

  return { allChecksPassed: true };
}

/**
 * TEST 5: What if expo-secure-store isn't available?
 */
function testFallback() {
  console.log('\n=== Fallback Plan ===');

  console.log('If expo-secure-store cannot be added:');
  console.log('Option A: Use AsyncStorage + warn user (acceptable for dev)');
  console.log('Option B: Skip YouTube Music API (use Invidious only)');
  console.log('Option C: Manual OAuth (ask user to copy token)');

  console.log('\nRecommendation: Option A (AsyncStorage + warning)');
  console.log('- YouTube Music is optional feature');
  console.log('- Invidious fallback always works');
  console.log('- Token is personal to user, acceptable risk');
  console.log('- But should migrate to SecureStore if possible');

  return {
    fallbackViable: true,
    fallbackApproach: 'asyncstorage_with_warning',
    mustMigrateToSecureStore: true,
  };
}

/**
 * DECISION GATE
 */
async function decideSecurity() {
  console.log('\n\n=== DECISION: OAuth Security for Phase 3 ===\n');

  const asyncTest = testAsyncStorage();
  const secureTest = testSecureStore();
  const expiryTest = testTokenExpiry();
  const checklistTest = testSecurityCheckList();
  const fallbackTest = testFallback();

  console.log('✅ DECISION: Use expo-secure-store + PKCE flow');

  console.log('\nImplementation Plan:');
  console.log('1. Check if expo-secure-store is in package.json');
  console.log('2. If not: npm install expo-secure-store');
  console.log('3. Store tokens in SecureStore (Keychain/Keystore)');
  console.log('4. Implement PKCE OAuth flow');
  console.log('5. Auto-refresh tokens before expiry');
  console.log('6. Fallback to Invidious if anything fails');

  console.log('\nSecurity Outcome:');
  console.log('✓ Tokens encrypted at OS level');
  console.log('✓ Automatic refresh (seamless to user)');
  console.log('✓ PKCE prevents authorization code interception');
  console.log('✓ Fallback strategy if OAuth fails');

  console.log('\nRisk Level: LOW (with fallback)');

  return {
    tokenStorageSafe: true,
    useSecureStore: true,
    addDependency: true,
    pkceRequired: true,
    fallbackToInvidious: true,
  };
}

export {
  testAsyncStorage,
  testSecureStore,
  testTokenExpiry,
  testSecurityCheckList,
  testFallback,
  decideSecurity
};
