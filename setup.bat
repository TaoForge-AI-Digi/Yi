@echo off
cd /d "%~dp0"
title Yi-Lin Setup

echo.
echo ========================================
echo        Yi-Lin Environment Setup
echo ========================================
echo.

:: ---------- Ensure Node.js ----------
:check_node
echo [1/5] Checking prerequisites...

where node >nul 2>&1
if %errorlevel% equ 0 goto node_found

echo.
echo Node.js is not installed.
echo.

:: Try winget (Windows 10/11 built-in)
where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo Attempting to install Node.js via winget...
    echo If a UAC prompt appears, please click Yes.
    echo.
    winget install OpenJS.NodeJS.LTS --accept-package-agreements
    if %errorlevel% equ 0 (
        echo.
        echo Node.js installed via winget. Refreshing PATH...
        set "PATH=%PATH%;C:\Program Files\nodejs\"
        goto check_node
    )
    echo winget install failed, trying alternative...
    echo.
)

:: Try direct download
echo Downloading Node.js installer...
set NODE_URL=https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi
set NODE_MSI=%TEMP%\node-install.msi
curl -L -o "%NODE_MSI%" "%NODE_URL%" >nul 2>&1
if exist "%NODE_MSI%" (
    echo Installing Node.js (may need admin rights)...
    echo If a UAC prompt appears, please click Yes.
    echo.
    msiexec /i "%NODE_MSI%" /quiet /norestart
    if %errorlevel% equ 0 (
        echo Node.js installed. Refreshing PATH...
        set "PATH=%PATH%;C:\Program Files\nodejs\"
        goto check_node
    )
)

echo.
echo ======================================================
echo  Could not auto-install Node.js.
echo  Please install it manually from:
echo  https://nodejs.org/  (LTS version 18+)
echo  Then run setup.bat again.
echo ======================================================
echo.
pause
exit /b 1

:node_found
for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_VER=%%a
set NODE_MAJOR=%NODE_VER:~1%
if %NODE_MAJOR% lss 18 (
    echo.
    echo Node.js version %NODE_VER:~1% is too old. Need 18+.
    echo Please upgrade from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
for /f "delims=" %%v in ('npm -v') do set NPM_VER=%%v
echo        Node.js found: %NODE_VER%
echo        npm found:      v%NPM_VER%
echo.

:: ---------- Install server dependencies ----------
echo [2/5] Installing server dependencies...
cd /d "%~dp0web\server"
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Server dependencies installation failed.
    echo If you see node-gyp/better-sqlite3 errors, try:
    echo   Run as Administrator: npm install --global windows-build-tools
    echo.
    pause
    exit /b 1
)
echo.

:: ---------- Install client dependencies ----------
echo [3/5] Installing client dependencies...
cd /d "%~dp0web\client"
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Client dependencies installation failed.
    pause
    exit /b 1
)
echo.

:: ---------- Build client ----------
echo [4/5] Building client...
cd /d "%~dp0web\client"
call npx vite build
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Client build failed.
    pause
    exit /b 1
)
echo.

:: ---------- Done ----------
echo [5/5] Setup complete!
echo.
echo You can now run:  run.bat
echo.
pause
