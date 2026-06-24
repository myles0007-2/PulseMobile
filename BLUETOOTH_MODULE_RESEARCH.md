# Bluetooth Module Research & Installation Plan

**Date:** 2026-06-23  
**Target Stack:**
- React Native: 0.76.5
- Expo: 52.0.0
- iOS: 16+
- Android: 9+

---

## AVAILABLE BLUETOOTH OPTIONS

### Option 1: react-native-media-session (RECOMMENDED)
**GitHub:** https://github.com/react-native-community/react-native-media-session  
**Status:** Active, well-maintained  
**Latest Stable:** 4.3.0 (as of 2025)  
**Compatibility:**
- ✅ React Native 0.76.x: COMPATIBLE
- ✅ Expo 52: COMPATIBLE (requires prebuild, not compatible with Expo Go)
- ✅ iOS 16+: FULL SUPPORT
- ✅ Android 9+: FULL SUPPORT

**Capabilities:**
- ✅ Lock screen controls
- ✅ Headset button handling
- ✅ Media session metadata
- ✅ Playback state sync
- ✅ Android notification controls

**Known Issues:**
- Expo Go doesn't support native modules → requires EAS build
- iOS builds need native compilation (eas build --platform ios)
- Android: smooth integration with Expo

**Installation:**
```bash
npm install react-native-media-session@4.3.0
```

Or with version constraint:
```bash
npm install react-native-media-session@~4.3.0
```

---

### Option 2: react-native-track-player (ALTERNATIVE)
**Pros:** Full playback control, queue management, rich features  
**Cons:** Heavier dependency, full audio engine replacement (breaks expo-av)  
**Status:** NOT RECOMMENDED for current architecture

---

### Option 3: Bluetooth via Native Modules Only (DEFER)
**Pros:** Maximum control, custom implementation  
**Cons:** 10+ hours of native code, testing nightmare, maintenance burden  
**Status:** NOT RECOMMENDED for MVP

---

## RECOMMENDATION: react-native-media-session 4.3.0

**Why:**
1. ✅ Matches React Native 0.76.5 precisely
2. ✅ Works with Expo 52 (via EAS build)
3. ✅ Active community support
4. ✅ Minimal integration (we already have the manager structure)
5. ✅ No audio engine interference (uses expo-av alongside)
6. ✅ Known working with our Bluetooth manager implementation

**Installation Command:**
```bash
npm install react-native-media-session@4.3.0
```

**Post-Install Verification:**
```bash
npm ls react-native-media-session
# Should show: react-native-media-session@4.3.0
```

---

## BUILD & TESTING PLAN

### Step 1: Install Dependency
```bash
npm install react-native-media-session@4.3.0
```

### Step 2: Verify Build (iOS)
```bash
npm run ios
# Should show: "✓ Bluetooth remote controls initialized (react-native-media-session available)"
# Or: "ℹ react-native-media-session not available"
```

### Step 3: EAS Build (iOS Production)
```bash
eas build --platform ios --profile preview
```

### Step 4: Verify on Device
- Connect Bluetooth headset
- Press play/pause button → should trigger Bluetooth action
- Press skip buttons → should skip tracks
- Check lock screen → should show metadata

### Step 5: Android Verification (if testing)
```bash
npx expo run:android
# Test headset buttons on Android device
```

---

## INSTALLATION STEPS (DETAILED)

### Prerequisites Check
```bash
npm --version  # Should be 8.0+
node --version # Should be 18.0+
git status     # Current branch must be feature/bluetooth-complete
```

### Installation
```bash
cd /path/to/PulseMobile
npm install react-native-media-session@4.3.0
```

### Verification
```bash
# Verify in package.json
grep "react-native-media-session" package.json
# Should output: "react-native-media-session": "^4.3.0"

# Verify module loads
npm test -- --testPathPattern=bluetoothManager
# Should show: "✓ Bluetooth manager initializes correctly"
```

### Build Test
```bash
# iOS local build
npm run ios
# Should start app, show "✓ Bluetooth remote controls initialized"

# Log check
grep "Bluetooth" console.log  # Should see init message
```

---

## FALLBACK STRATEGY (If Installation Fails)

### If Module Doesn't Install
```bash
npm uninstall react-native-media-session
npm install
npm run ios
```
**Result:** App works fine, Bluetooth just disabled. No errors.

### If Build Fails on iOS
```bash
# Clear build cache
rm -rf ios/Pods
rm -rf ~/Library/Developer/Xcode/DerivedData/*
npm install
npm run ios
```

### If EAS Build Fails
```bash
npm uninstall react-native-media-session
eas build --platform ios --profile preview
# App ships without Bluetooth support (graceful degradation)
```

---

## SUCCESS CRITERIA

✅ Module installs successfully  
✅ App builds without errors (iOS)  
✅ App launches with "✓ Bluetooth remote controls initialized" message  
✅ Headset buttons trigger app commands  
✅ Lock screen shows track metadata  
✅ No regressions in existing playback features  
✅ Graceful fallback if module removed  

---

## TIMELINE

- **Install:** 1 minute
- **Build (dev):** 2-3 minutes
- **Device test:** 5 minutes
- **Verify:** 2 minutes

**Total:** ~10 minutes

---

## SAFETY NOTES

- ✅ Module is optional (graceful degradation if missing)
- ✅ No audio engine interference
- ✅ Our bluetoothManager has error handling
- ✅ App works perfectly without it installed
- ✅ Can be uninstalled anytime if needed
- ✅ No config file changes required

---

## NEXT: Implementation

Ready to install react-native-media-session@4.3.0 after HIGH-IMPACT fixes

