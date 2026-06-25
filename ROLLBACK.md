# PulseMobile Rollback Procedure

**Last Updated:** 2026-06-24  
**Current Build:** Phase 2+3 (Offline Downloads + YouTube Music API)

---

## Emergency Rollback to Phase 2-Only

If Phase 3 (YouTube Music API) causes critical issues post-launch, follow this procedure to roll back to Phase 2-only (offline downloads).

### Timeline
- **Rollback decision point:** 48 hours post-launch
- **Decision criteria:** 
  - Error rate > 5% (logs via Crashlytics)
  - YouTube Music unavailable > 30% of attempts
  - Auth failures > 10% of user sessions
- **Execution time:** ~10 minutes from decision to hotfix build ready
- **Deployment time:** ~30-45 minutes via EAS

---

## Option A: Runtime Feature Flag (Fast, 10 minutes)

### 1. Disable YouTube Music at Runtime

Edit `src/store/useStore.ts`:

```typescript
// Line ~587-591: Disable YouTube Music initialization
initializeYouTubeAuth: async () => {
  // ROLLBACK: YouTube Music disabled due to production issues
  console.warn('[ROLLBACK] YouTube Music disabled—using Invidious fallback only');
  set({ youtubeAuthInitialized: true, youtubeAuthenticated: false, youtubeCircuitBreakerTripped: true });
  return;
  
  // Original code below (disabled):
  // const { youtubeMusicAuth } = await import(...);
  // ...
},
```

### 2. Disable YouTube Music UI

Edit `src/navigation/AppNavigator.tsx`:

Comment out the YouTube Music tab:

```typescript
// DISABLED: YouTube Music tab (Phase 3 rollback)
/*
<Tab.Screen name="Online" component={OnlineScreen} ... />
*/
```

### 3. Test Locally

```bash
npm run start:clear
# Open app in simulator
# Verify: Only Library, Liked, Playlists, History tabs visible
# Try playing a track: should use Invidious fallback
```

### 4. Commit & Push

```bash
git commit -m "rollback: disable YouTube Music (Phase 3) due to production issues

Disabled YouTube Music OAuth initialization and UI tab.
YouTube Music is skipped; fallback to Invidious/Piped active.
Offline downloads (Phase 2) remain fully functional.

Rollback decision: 2026-06-24 (emergency hotfix)"

git push origin feature/phase-2-offline-downloads
```

### 5. Trigger EAS Build

```bash
eas build --platform ios --profile production
```

---

## Option B: Clean Phase 2 Build (Safest, 20 minutes)

If Option A isn't sufficient:

### 1. Create Phase 2-Only Branch

```bash
git checkout -b hotfix/phase-2-only origin/feature/phase-2-offline-downloads

# Hard reset to last known-good Phase 2 commit (before Phase 3 integration)
git reset --hard <COMMIT_HASH_BEFORE_PHASE_3>
# Example: git reset --hard abc1234 (commit before YouTube Music was added)
```

### 2. Verify Phase 2 Code

```bash
git log --oneline -5
# Should show: 
#   ✓ Phase 2 offline downloads
#   ✓ All 41 audit bug fixes
#   ✗ No Phase 3 YouTube Music API
#   ✗ No Phase 4-7 features
```

### 3. Push & Build

```bash
git push origin hotfix/phase-2-only -f
eas build --platform ios --profile production
```

### 4. Coordinate Deployment

- Notify team: "Rollback to Phase 2-only initiated"
- Monitor EAS build status
- Once IPA ready: release to App Store TestFlight first, then production

---

## Post-Rollback Analysis

### What to Check

1. **Crash Logs (Crashlytics)**
   - Filter: "YouTube Music" or "Invidious" errors
   - Identify: Root cause of 5%+ error rate

2. **Network Logs**
   - YouTube Music API latency and error patterns
   - Circuit-breaker trigger frequency

3. **User Feedback**
   - App Store reviews from Phase 3 window
   - Identify: User experience issues vs. technical bugs

### When to Re-Ship Phase 3

- **After:** Identified root cause and implemented fix
- **Validation:** Tested fix in staging environment (TestFlight)
- **Confidence:** Error rate drops below 1% in staging

---

## Prevention for Future Rollbacks

1. **Pre-Launch Validation**
   - Test on 5+ real devices (not just emulator)
   - Monitor Crashlytics for 24 hours pre-launch
   - A/B test Phase 3 on 10% of users first

2. **Circuit-Breaker Confidence**
   - Verify fallback works: YouTube → Invidious → Piped
   - Test each fallback independently
   - Log every fallback event for monitoring

3. **Staged Rollout**
   - Day 1: 10% user traffic
   - Day 2: 50% user traffic
   - Day 3+: 100% traffic (if error rate < 1%)

---

## Emergency Contact

If rollback is needed:
- **Decision maker:** [Project Lead]
- **Slack channel:** #pulsemobile-incidents
- **Status page:** [Update internal status if applicable]

---

## Rollback Execution Checklist

### Pre-Rollback
- [ ] Error rate confirmed > 5% or critical bug identified
- [ ] Root cause analyzed
- [ ] Decision maker approved rollback
- [ ] Git branch clean (no uncommitted changes)

### Rollback Steps
- [ ] Option A (feature flag) or Option B (clean branch) chosen
- [ ] Changes committed locally
- [ ] Changes pushed to GitHub
- [ ] EAS build triggered
- [ ] Build completes successfully

### Post-Rollback
- [ ] IPA successfully published to App Store
- [ ] Deployment notification sent to team
- [ ] Crashlytics monitored (error rate < 1% expected)
- [ ] Post-mortem scheduled (within 48 hours)

### Recovery
- [ ] Root cause fixed and tested
- [ ] Phase 3 re-shipped in new build
- [ ] No regression detected

---

## Reference

- **Phase 2 Features:** Offline downloads, iTunes library scan, Documents directory
- **Phase 3 Features:** YouTube Music API, three-tier fallback (YouTube → Invidious → Piped), OAuth token management
- **Circuit-breaker:** Automatically falls back to Invidious if YouTube Music unavailable
- **Logging:** All fallback events logged with `[Circuit-breaker]` prefix
