# PulseMobile - iOS IPA Build Pipeline
# Right-click this file and choose "Run with PowerShell"
# OR run from any terminal: cd to this folder, then: .\build.ps1

$ErrorActionPreference = 'Continue'
$host.UI.RawUI.WindowTitle = "PulseMobile Build Pipeline"
$LogFile = Join-Path $PSScriptRoot "build-log.txt"

function Log($msg) {
    Write-Host $msg
    Add-Content $LogFile $msg
}

function Pause-Script($msg = "Press ENTER to continue...") {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor Yellow
    Read-Host | Out-Null
}

function Fatal($msg) {
    Write-Host ""
    Write-Host "  ERROR: $msg" -ForegroundColor Red
    Write-Host ""
    Pause-Script "Fix the issue above, then run build.ps1 again. Press ENTER to close."
    exit 1
}

# ── Ensure window stays open if double-clicked ──────────────────
$ranDirectly = $MyInvocation.InvocationName -eq $MyInvocation.MyCommand.Path

Set-Content $LogFile "Build started $(Get-Date)"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  PulseMobile - iOS IPA Build Pipeline" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Log: $LogFile"
Write-Host ""

# ── PATH: Node.js + npm global bin ────────────────────────────
$extraPaths = @(
    "C:\Program Files\nodejs",
    "C:\Program Files (x86)\nodejs",
    "C:\nvm4w\nodejs",
    "$env:APPDATA\Local\Programs\nodejs",
    "$env:APPDATA\nvm\nodejs",
    # npm global bin — where eas.cmd, expo.cmd, etc. are installed
    "$env:APPDATA\npm",
    "$env:APPDATA\Roaming\npm",
    "C:\Users\$env:USERNAME\AppData\Roaming\npm"
)
foreach ($p in $extraPaths) {
    if ($p -and (Test-Path $p) -and ($env:PATH -notlike "*$p*")) {
        $env:PATH = "$p;$env:PATH"
    }
}
# Derive npm global bin from npm itself (most reliable)
try {
    $npmRoot = & npm root -g 2>$null
    if ($npmRoot -and (Test-Path $npmRoot)) {
        $npmBin = Split-Path $npmRoot -Parent   # one level up from node_modules
        if ($env:PATH -notlike "*$npmBin*") { $env:PATH = "$npmBin;$env:PATH" }
    }
} catch {}

# ── 1. Node.js ──────────────────────────────────────────────────
Write-Host "[1/6] Checking Node.js..." -ForegroundColor Green
$nodeVer = & node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Fatal "Node.js not found. Download from https://nodejs.org (LTS version), install it, then run this script again."
}
Write-Host "  Node.js $nodeVer found."
Write-Host ""

# ── 2. npm install ──────────────────────────────────────────────
Write-Host "[2/6] Installing npm dependencies..." -ForegroundColor Green
Write-Host "  (--legacy-peer-deps is normal for React Native)"
Write-Host ""
& npm install --legacy-peer-deps 2>&1 | Tee-Object -Append $LogFile
if ($LASTEXITCODE -ne 0) {
    Fatal "npm install failed. Check the output above and $LogFile for details."
}
Write-Host ""
Write-Host "  Dependencies installed OK." -ForegroundColor Green
Write-Host ""

# ── 3. EAS CLI ──────────────────────────────────────────────────
Write-Host "[3/6] Checking EAS CLI..." -ForegroundColor Green

# Find eas.cmd — check PATH, then check the known AppData npm bin directly
$EAS_CMD = $null
if (Get-Command eas -ErrorAction SilentlyContinue) {
    $EAS_CMD = "eas"
} elseif (Test-Path "$env:APPDATA\npm\eas.cmd") {
    $EAS_CMD = "$env:APPDATA\npm\eas.cmd"
    $env:PATH = "$env:APPDATA\npm;$env:PATH"
} elseif (Test-Path "C:\Users\$env:USERNAME\AppData\Roaming\npm\eas.cmd") {
    $EAS_CMD = "C:\Users\$env:USERNAME\AppData\Roaming\npm\eas.cmd"
    $env:PATH = "C:\Users\$env:USERNAME\AppData\Roaming\npm;$env:PATH"
}

if (-not $EAS_CMD) {
    Write-Host "  Installing EAS CLI globally (one-time setup)..."
    & npm install -g eas-cli 2>&1 | Tee-Object -Append $LogFile
    if ($LASTEXITCODE -ne 0) {
        Fatal "Could not install eas-cli. Try running: npm install -g eas-cli"
    }
    # Re-check after install
    if (Test-Path "$env:APPDATA\npm\eas.cmd") {
        $EAS_CMD = "$env:APPDATA\npm\eas.cmd"
        $env:PATH = "$env:APPDATA\npm;$env:PATH"
    } else {
        $EAS_CMD = "eas"
    }
}

$easVerRaw = & $EAS_CMD --version 2>&1
$easVer = ($easVerRaw | Select-String 'eas-cli/[\d.]+').Matches.Value
if (-not $easVer) { $easVer = $easVerRaw | Where-Object { $_ -match 'eas' } | Select-Object -First 1 }
Write-Host "  EAS CLI $easVer found."
Write-Host ""

# ── 4. Expo login ───────────────────────────────────────────────
Write-Host "[4/6] Checking Expo account..." -ForegroundColor Green
$expoUser = & $EAS_CMD whoami 2>$null
if (-not $expoUser -or $LASTEXITCODE -ne 0) {
    Write-Host "  Not logged in."
    Write-Host "  Need a free account? https://expo.dev/signup"
    Write-Host ""
    & $EAS_CMD login
    if ($LASTEXITCODE -ne 0) { Fatal "Login failed. Run: eas login" }
    $expoUser = & $EAS_CMD whoami 2>$null
}
Write-Host "  Logged in as: $expoUser"
Write-Host ""

# ── 5. EAS project init ─────────────────────────────────────────
Write-Host "[5/6] Linking EAS project..." -ForegroundColor Green
Write-Host "  (If asked 'project already exists' - type Y)"
Write-Host ""
& $EAS_CMD init --non-interactive 2>$null
if ($LASTEXITCODE -ne 0) {
    & $EAS_CMD init
}
Write-Host ""

# ── 6. Build ────────────────────────────────────────────────────
Write-Host "[6/6] Cloud iOS build" -ForegroundColor Green
Write-Host ""
Write-Host "  +-------------------------------------------------+" -ForegroundColor Cyan
Write-Host "  |  WHERE WILL MY IPA BE?                         |" -ForegroundColor Cyan
Write-Host "  |                                                 |" -ForegroundColor Cyan
Write-Host "  |  Expo builds the IPA on their Mac servers.     |" -ForegroundColor Cyan
Write-Host "  |  It does NOT save to your PC automatically.    |" -ForegroundColor Cyan
Write-Host "  |                                                 |" -ForegroundColor Cyan
Write-Host "  |  When done (~15 min):                          |" -ForegroundColor Cyan
Write-Host "  |    1. Go to https://expo.dev                   |" -ForegroundColor Cyan
Write-Host "  |    2. Sign in → Projects → PulseMobile         |" -ForegroundColor Cyan
Write-Host "  |    3. Click Builds → your build                |" -ForegroundColor Cyan
Write-Host "  |    4. Click 'Download Artifact' to get the IPA |" -ForegroundColor Cyan
Write-Host "  +-------------------------------------------------+" -ForegroundColor Cyan
Write-Host ""
Write-Host "  You will be asked for your Apple ID to sign the app."
Write-Host "  A free Apple ID is enough (no paid developer account)."
Write-Host ""

Pause-Script "Press ENTER to start the cloud build (Ctrl+C to cancel)"
Write-Host ""

& $EAS_CMD build --platform ios --profile preview
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  Build submission failed. See output above." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Common fixes:" -ForegroundColor Yellow
    Write-Host "    - Run:  eas credentials --platform ios"
    Write-Host "      Delete old certs and try again."
    Write-Host "    - Make sure 2FA is enabled on your Apple ID."
    Write-Host "    - Check: https://expo.dev/accounts/$expoUser/projects"
    Pause-Script "Press ENTER to close."
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  BUILD SUBMITTED - check expo.dev for progress" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:"
Write-Host ""
Write-Host "  1. Go to https://expo.dev and sign in"
Write-Host "  2. Projects → PulseMobile → Builds"
Write-Host "  3. Wait ~15 min for the build to finish"
Write-Host "  4. Click the build → 'Download Artifact' to get your .ipa"
Write-Host ""
Write-Host "  To sideload on iPhone X:" -ForegroundColor Cyan
Write-Host "    a. Install Sideloadly: https://sideloadly.io"
Write-Host "    b. Open iTunes (provides USB drivers)"
Write-Host "    c. Connect iPhone via USB"
Write-Host "    d. Drag the .ipa file into Sideloadly"
Write-Host "    e. Enter your Apple ID and click Start"
Write-Host "    f. On iPhone: Settings > General > VPN & Device Management"
Write-Host "       > Trust [your Apple ID]"
Write-Host ""
Add-Content $LogFile "Build submitted at $(Get-Date)"

Pause-Script "Press ENTER to close this window."
