@echo off
cd /d "%~dp0"
title Yi-Lin Setup

:: ---------- Pre-flight checks ----------
echo [1/5] Checking prerequisites...

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo.
    echo Please install Node.js 18+ from https://nodejs.org/
    echo Or use fnm:  fnm install 18  ^&^&  fnm use 18
    echo Or use nvm:  nvm install 18  ^&^&  nvm use 18
    pause
    exit /b 1
)

:: Check Node.js version
for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_VER=%%a
set NODE_MAJOR=%NODE_VER:~1%
if %NODE_MAJOR% lss 18 (
    echo [ERROR] Node.js 18+ is required.
    for /f "delims=" %%v in ('node -v') do echo   Current: %%v
    pause
    exit /b 1
)

:: Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not installed or not in PATH.
    echo Node.js should have included npm. Try reinstalling from https://nodejs.org/
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
    echo [ERROR] Server dependencies installation failed.
    echo.
    echo If the error mentions "node-gyp" or "better-sqlite3":
    echo   Run as Administrator:
    echo     npm install --global windows-build-tools
    echo.
    echo   Or install Visual Studio Build Tools:
    echo     https://visualstudio.microsoft.com/visual-cpp-build-tools/
    pause
    exit /b 1
)
echo.

:: ---------- Install client dependencies ----------
echo [3/5] Installing client dependencies...
cd /d "%~dp0web\client"
call npm install
if %errorlevel% neq 0 (
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
