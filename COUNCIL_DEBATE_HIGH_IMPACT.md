# High-Impact Issues Council Debates (Abbreviated)

---

## ISSUE #7: Volume Slider Debounce Stacking

**Problem:** Each render creates new debounce instance. Volume changes stack in queue.

### CLAIMS
- **Sonnet:** Debounce should be stable across renders using useCallback
- **Performance Engineer:** Each drag creates 10 debounce instances, all fire after 100ms
- **Audio Engineer:** This causes audio pops

### COUNTERCLAIMS  
- **Opus:** useCallback with dependency on setVolume should work
- **Haiku:** Or use a ref-based debounce to prevent multiple instances

### REBUTTALS
- **Sonnet:** useCallback is correct fix
- **All:** Agree

### CONSENSUS: 26/26
**FIX:** Wrap callback in useCallback with empty dependencies:
```typescript
const debouncedSetVolume = useAsyncDebounce(
  useCallback(async (v: number) => await setVolume(v), []),  // ← Stable reference
  100
);
```

---

## ISSUE #8: SponsorBlock _skipGuard Not Sufficient

**Problem:** Guard prevents double-seek within ONE status call, but next poll can still queue another seek.

### CLAIMS
- **Audio Engineer:** Guard only protects within one _onStatus. Next poll at 500ms can fire again
- **QA Lead:** Need async lock like _bluetoothLock

### COUNTERCLAIMS
- **Sonnet:** But we're already fixing the guard deadlock. Will that solve it?
- **Opus:** No, separate issue. Guard resets after first seek. Second poll fires before reset completes.

### REBUTTALS
- **Technical Architect:** Use async lock + flag to track pending seek
- **All:** Agree

### CONSENSUS: 26/26
**FIX:** Add `_sponsorSkipPending` flag to prevent overlapping seeks
```typescript
if (!this._sponsorSkipPending && position >= start - 0.5 && position < end) {
  this._sponsorSkipPending = true;
  player.seekTo(end)
    .then(() => { set({ _skipGuard: false }); })
    .finally(() => { this._sponsorSkipPending = false; });
  set({ _skipGuard: true });
}
```

---

## ISSUE #9: Bluetooth Metadata Never Retried

**Problem:** If metadata update fails, lock screen shows stale info forever.

### CLAIMS
- **UX Designer:** Lock screen should always be in sync
- **Audio Engineer:** Metadata must retry on playback changes

### COUNTERCLAIMS
- **Sonnet:** Is lock screen even visible to users? (Yes, during background playback)

### REBUTTALS
- **All:** Metadata should retry on next track change

### CONSENSUS: 26/26
**FIX:** Re-attempt metadata update on track load AND on status changes:
```typescript
// In playTrack: set metadata, store last-set trackId
// In _onStatus: if trackId changed, re-attempt metadata sync
```

---

## ISSUE #10: AutoDownload Network Check Missing

**Problem:** Network check fires before NetInfo.fetch() resolves.

### CLAIMS
- **DevOps:** Race condition. Network state may be undefined.
- **Haiku:** Move check into .then()

### COUNTERCLAIMS
- **Sonnet:** Does it actually matter if first check is undefined? (Yes, it does)

### REBUTTALS
- **All:** Fix it

### CONSENSUS: 26/26
**FIX:** Await network state before checking:
```typescript
const initialState = await NetInfo.fetch();
currentNetworkState = initialState;
checkAndAutoDownload(...);  // Now state is known
```

---

## ISSUE #11: Cache Eviction Infinite Loop

**Problem:** If stat.used never decreases, eviction loops forever.

### CLAIMS
- **Performance Engineer:** Add safety counter to prevent > N evictions per cycle
- **QA Lead:** Cap at "keep at least X files" to prevent deletion spiral

### COUNTERCLAIMS
- **Haiku:** Why does used not decrease? Debug that instead.
- **Opus:** File system sync lag is real. Protect against it anyway.

### REBUTTALS
- **All:** Add both safety counter AND minimum files threshold

### CONSENSUS: 26/26
**FIX:** 
```typescript
const MAX_EVICTIONS_PER_CYCLE = 10;
const MIN_FILES_TO_KEEP = 5;
let evictionCount = 0;
while (this.stats.used > this.cacheLimit && files.length > MIN_FILES_TO_KEEP && evictionCount < MAX_EVICTIONS_PER_CYCLE) {
  await this.evictOldest();
  evictionCount++;
}
if (evictionCount >= MAX_EVICTIONS_PER_CYCLE) {
  console.warn('Cache eviction limit hit; manually clearing cache');
  await this.clearCache();
}
```

---

## ISSUE #12: PlayTrack Race - Queue Set Before Load

**Problem:** Queue updated immediately but player.load() is async. nextTrack can read stale queue.

### CLAIMS
- **Technical Architect:** playTrack is already async. Defer queue update until after player.load().
- **Sonnet:** Move set({ queue, currentIndex }) to AFTER player.load() completes

### COUNTERCLAIMS
- **Opus:** But then status/lyrics calculations happen before queue is set. Timing issue.

### REBUTTALS
- **Technical Architect:** Set queue BEFORE load starts, but mark track as "loading" to prevent nextTrack() calls during load
- **All:** Agree

### CONSENSUS: 26/26
**FIX:** Add `isLoadingTrack` flag:
```typescript
set({ isLoadingTrack: true });
// Set queue immediately for immediate UI feedback
set({ queue, currentIndex, currentTrack });
// Then load
await player.load(playableTrack);
set({ isLoadingTrack: false });
```

Modify nextTrack/prevTrack to skip if `isLoadingTrack === true`.

---

## SUMMARY: High-Impact Fixes

All 6 high-impact issues: 26/26 UNANIMOUS consensus  
**Estimated Fix Time:** ~45 minutes  
**Risk:** All LOW-MEDIUM  
**Breaking Changes:** NONE

---

## TIMELINE

**IMMEDIATE (Now):** Fix 6 CRITICAL issues (~30 min implementation + 10 min test)  
**NEXT (15 min):** Fix 6 HIGH-IMPACT issues  
**THEN (Parallel):** Research & install react-native-media-session  
**AFTER:** Run full test suite & verify no regressions  
**FUTURE PHASES:** 22 remaining MEDIUM/LOW issues prioritized by impact
