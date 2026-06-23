@echo off
:: If not already running in a persistent window, relaunch in one and stay open
if "%RELAUNCHED%"=="" (
    set RELAUNCHED=1
    cmd /k "set RELAUNCHED=1 && ""%~f0"""
    exit /b
)

setlocal enabledelayedexpansion
cd /d "%~dp0"
title PulseMobile Build Pipeline

set LOGFILE=%~dp0build-log.txt
echo Build started %DATE% %TIME% > "%LOGFILE%"

call :main
echo.
echo ============================================================
echo   Done. Full log saved to: build-log.txt
echo ============================================================
echo.
echo   This window will stay open. Type EXIT to close it.
goto :eof

:: ══════════════════════════════════════════════════════════════
:main
echo.
echo ============================================================
echo   PulseMobile - iOS IPA Build Pipeline
echo ============================================================
echo.
echo   Log file: %LOGFILE%
echo.

:: ── PATH refresh ───────────────────────────────────────────────
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USR_PATH=%%B"
if defined SYS_PATH set "PATH=%SYS_PATH%;%PATH%"
if defined USR_PATH set "PATH=%USR_PATH%;%PATH%"
if exist "C:\Program Files\nodejs"       set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "C:\Program Files (x86)\nodejs" set "PATH=C:\Program Files (x86)\nodejs;%PATH%"
for /f "tokens=2*" %%A in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\node.exe" 2^>nul') do set "PATH=%%~dpB;%PATH%"

:: ── Step 1: Node.js ────────────────────────────────────────────
echo [1/6] Checking Node.js...
set NODE_OK=0
node --version >nul 2>&1 && set NODE_OK=1
if "%NODE_OK%"=="0" (
    if exist "C:\Program Files\nodejs\node.exe"       set "PATH=C:\Program Files\nodejs;%PATH%"       && set NODE_OK=1
    if exist "C:\Program Files (x86)\nodejs\node.exe" set "PATH=C:\Program Files (x86)\nodejs;%PATH%" && set NODE_OK=1
)
if "%NODE_OK%"=="0" (
    echo.
    echo   ERROR: Node.js not found.
    echo   Download from: https://nodejs.org  (pick LTS)
    echo   Install it, then run build.bat again.
    echo.
    echo ERROR: Node.js not found >> "%LOGFILE%"
    goto :eof
)
for /f %%v in ('node --version 2^>^&1') do set NODE_VER=%%v
echo   Node.js %NODE_VER% found.
echo   Node.js %NODE_VER% >> "%LOGFILE%"
echo.

:: ── Step 2: npm install ────────────────────────────────────────
echo [2/6] Installing npm dependencies...
echo   (legacy-peer-deps is normal for React Native projects)
echo.
npm install --legacy-peer-deps 2>&1 | tee -a "%LOGFILE%" 2>nul || npm install --legacy-peer-deps
if errorlevel 1 (
    echo.
    echo   ERROR: npm install failed. Scroll up to see the errors.
    echo   Also check: %LOGFILE%
    echo.
    goto :eof
)
echo.
echo   Dependencies OK.
echo.

:: ── Step 3: EAS CLI ────────────────────────────────────────────
echo [3/6] Checking EAS CLI...
eas --version >nul 2>&1
if errorlevel 1 (
    echo   Installing EAS CLI globally (one-time setup)...
    npm install -g eas-cli
    if errorlevel 1 (
        echo.
        echo   ERROR: Could not install eas-cli.
        echo   Run manually:  npm install -g eas-cli
        echo.
        goto :eof
    )
)
for /f %%v in ('eas --version 2^>^&1') do set EAS_VER=%%v
echo   EAS CLI %EAS_VER% found.
echo.

:: ── Step 4: Expo login ─────────────────────────────────────────
echo [4/6] Checking Expo account...
set EXPO_USER=
for /f "tokens=*" %%u in ('eas whoami 2^>nul') do set EXPO_USER=%%u
if not defined EXPO_USER (
    echo   Not logged in. Starting Expo login...
    echo   (Need an account? https://expo.dev/signup — it is free)
    echo.
    eas login
    if errorlevel 1 (
        echo   ERROR: Login failed. Run:  eas login
        goto :eof
    )
    for /f "tokens=*" %%u in ('eas whoami 2^>nul') do set EXPO_USER=%%u
)
echo   Logged in as: %EXPO_USER%
echo.

:: ── Step 5: EAS project init ───────────────────────────────────
echo [5/6] Linking EAS project...
eas init --non-interactive 2>nul
if errorlevel 1 (
    echo   Trying interactive init (say Y if asked about existing project)...
    eas init
)
echo.

:: ── Step 6: Build ──────────────────────────────────────────────
echo [6/6] Cloud iOS build
echo.
echo   ┌─────────────────────────────────────────────────────┐
echo   │  WHERE IS MY IPA?                                   │
echo   │                                                     │
echo   │  Expo builds the IPA on a Mac in their cloud.      │
echo   │  It will NOT appear on your PC automatically.      │
echo   │                                                     │
echo   │  After the build finishes (~15 min) go to:         │
echo   │    https://expo.dev                                 │
echo   │  Sign in → Projects → PulseMobile → Builds         │
echo   │  Click the finished build → Download Artifact      │
echo   │                                                     │
echo   │  Save the .ipa somewhere easy to find,             │
echo   │  then drag it into Sideloadly to install.          │
echo   └─────────────────────────────────────────────────────┘
echo.
echo   You will be asked for your Apple ID credentials.
echo   A free Apple ID is enough — no paid developer account.
echo.
echo   Press ENTER to start the cloud build, or Ctrl+C to cancel.
pause >nul
echo.
eas build --platform ios --profile preview
if errorlevel 1 (
    echo.
    echo   Build submission failed. Scroll up for details.
    echo   Common fixes:
    echo     • eas credentials --platform ios  then delete old certs
    echo     • Make sure your Apple ID has 2FA enabled
    echo.
    goto :eof
)

echo.
echo ============================================================
echo   BUILD SUBMITTED — check expo.dev for progress
echo ============================================================
echo.
echo   1. Go to https://expo.dev and sign in
echo   2. Projects → PulseMobile → Builds
echo   3. Wait ~15 min for the build to finish
echo   4. Click the build → Download Artifact  (.ipa file)
echo   5. Sideload with Sideloadly (https://sideloadly.io):
echo        a. Open iTunes first (provides USB drivers)
echo        b. Connect iPhone X via USB
echo        c. Drag .ipa into Sideloadly
echo        d. Enter Apple ID and click Start
echo   6. On iPhone: Settings → General → VPN and Device Mgmt
echo        → Trust [your Apple ID]
echo.
goto :eof
