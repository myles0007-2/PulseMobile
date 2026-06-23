# PulseMobile — Build & Sideload Guide (Windows → iPhone X iOS 16)

## Prerequisites

| Tool | Download |
|------|----------|
| Node.js 20 LTS | https://nodejs.org |
| EAS CLI | `npm install -g eas-cli` |
| Expo account (free) | https://expo.dev/signup |
| Sideloadly (free, Windows) | https://sideloadly.io |
| iTunes for Windows | https://www.apple.com/itunes |
| Apple ID (free) | https://appleid.apple.com |

---

## Step 1 — Install dependencies

```
cd C:\Users\mstud\Desktop\PulseMobile
npm install
```

---

## Step 2 — Create an Expo account & log in

```
eas login
```

Follow the prompts (email + password). Free tier is sufficient.

---

## Step 3 — Initialize your EAS project

```
eas init
```

This generates a project ID. Copy it into `app.json` → `extra.eas.projectId`.

---

## Step 4 — Configure Apple credentials

You need a **free Apple ID** (no paid Developer account required for sideloading).

Run:
```
eas credentials
```

Select **iOS → Ad Hoc / Internal**. EAS will generate a certificate and provisioning profile using your Apple ID. You will be prompted for your Apple ID and password.

> If you have 2FA enabled, you'll enter a code. This is normal.

---

## Step 5 — Build the IPA (cloud build — no Mac needed)

```
eas build --platform ios --profile preview
```

This uploads your code to Expo's servers and builds it in the cloud (~10-15 min).
When done, you'll see a URL to download the `.ipa` file. Download it.

---

## Step 6 — Sideload with Sideloadly

1. Install **Sideloadly** from https://sideloadly.io
2. Connect your **iPhone X** via USB to your Windows PC
3. Open **iTunes first** (Sideloadly needs its drivers)
4. Open Sideloadly
5. Drag the `.ipa` file onto Sideloadly
6. Enter your **Apple ID** and password
7. Click **Start**
8. On your iPhone: **Settings → General → VPN & Device Management → Trust** your Apple ID developer certificate
9. Open **PulseMobile** from your home screen ✅

> **Re-sideloading:** Free Apple IDs expire every 7 days. Re-run Sideloadly with the same IPA to renew. AltStore or SideStore can auto-renew via WiFi if you want a longer-term solution.

---

## Transferring 2,800 Songs

### Method A — iTunes File Sharing (Best for Windows, handles large libraries)

1. Connect iPhone via USB
2. Open **iTunes** → click your device icon
3. Click **File Sharing** in the sidebar
4. Select **PulseMobile** in the app list
5. Drag your entire music folder into the "PulseMobile Documents" panel
6. Wait for transfer to complete (USB = ~40MB/s — 2800 songs ≈ 15-20 min)
7. Open PulseMobile → Library tab → tap **Rescan**

### Method B — WiFi Transfer (No USB cable needed)

If you add this in a future update, the app can run a local HTTP server on the phone (react-native-http-bridge). For now, use Method A.

### Method C — iOS Music App Sync (if you use iTunes to manage music)

1. In iTunes: click your device → **Music** tab → **Sync Music** → select playlists/artists
2. After sync, open PulseMobile → Library → **Load Music Library**
3. The app will read your iOS Music library via the media library API

### Method D — iCloud Drive (Slowest, no USB needed)

1. Upload your music to iCloud Drive from PC
2. On iPhone: open PulseMobile → Library → **+ Files**
3. Browse to iCloud Drive and select files or folders

---

## App Features

| Feature | Status |
|---------|--------|
| Local music playback | ✅ |
| iOS Media Library (iTunes synced) | ✅ |
| Import files from Files app | ✅ |
| Background audio (lock screen) | ✅ |
| YouTube Music streaming | ✅ (via Invidious API) |
| Podcast streaming (8 featured + RSS) | ✅ |
| Search local library | ✅ |
| Shuffle / Repeat | ✅ |
| Albums / Artists / Tracks tabs | ✅ |
| Now Playing full-screen | ✅ |
| iPhone X safe area (notch + home bar) | ✅ |

---

## Troubleshooting

**"Untrusted Developer" on iPhone:** Settings → General → VPN & Device Management → tap your Apple ID → Trust

**App crashes on launch:** In Sideloadly, check "Normal install" option and try again

**No music shows after scan:** Make sure you tapped "Allow" when PulseMobile asked for Music Library access. If you missed it: Settings → PulseMobile → Photos → set to "Full Access"

**YouTube streaming fails:** The app uses public Invidious instances. If one is down, it auto-tries others. Requires active internet connection.

**Build fails with "credentials":** Run `eas credentials --platform ios` and delete existing certs, then retry
