@echo off
cd /d "%~dp0"
title Yi-Lin Setup

:: ---------- Ensure Node.js ----------
echo [1/5] Checking prerequisites...

:check_node
where node >nul 2>&1
if %errorlevel% neq 0 goto install_node

for /f "tokens=1 delims=." %%a in ('node -v') do set NODE_VER=%%a
set NODE_MAJOR=%NODE_VER:~1%
if %NODE_MAJOR% lss 18 (
    echo [WARNING] Node.js version too old: %NODE_VER:~1%
    echo Reinstalling...
    goto install_node
)

for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
for /f "delims=" %%v in ('npm -v') do set NPM_VER=%%v
echo        Node.js found: %NODE_VER%
echo        npm found:      v%NPM_VER%
echo.
goto deps_install

:install_node
echo [SETUP] Node.js not found. Attempting automatic install...

where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo Installing Node.js via winget...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements
    if %errorlevel% neq 0 (
        echo [WARNING] winget install failed, trying alternative...
        goto install_fnm
    )
    :: Refresh PATH
    for /f "delims=" %%v in ('echo %PATH%') do set PATH=%PATH%;C:\Program Files\nodejs\
    goto check_node
)

:install_fnm
where fnm >nul 2>&1
if %errorlevel% equ 0 (
    echo Installing Node.js via fnm...
    fnm install 18 && fnm use 18
    call fnm env --use-on-cd | more
    goto check_node
)

:install_manual
echo.
echo ======================================================
echo  Could not auto-install Node.js.
echo  Please install manually from:
echo  https://nodejs.org/  (LTS version, 18+)
echo ======================================================
echo.
pause
exit /b 1

:deps_install

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
