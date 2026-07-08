@echo off
cd /d "%~dp0"
title Yi-Lin Setup

echo.
echo ========================================
echo        Yi-Lin Environment Setup
echo ========================================
echo.

:: ---------- Step 1: Node.js ----------
echo [1/5] Checking Node.js...

where node >nul 2>&1
if %errorlevel% equ 0 goto node_ok

:: Try local installer
if exist setup\*.msi (
    for %%f in (setup\*.msi) do (
        echo Found: %%~nxf
        echo Installing... (may need admin rights)
        start /wait msiexec /i "%%f" /quiet /norestart
        if %errorlevel% equ 0 (
            echo Node.js installed.
            set "PATH=%PATH%;C:\Program Files\nodejs\"
            goto node_ok
        )
        echo Install failed (try right-click ^> Run as Administrator)
    )
)

echo.
echo ======================================================
echo  Node.js not found or install failed.
echo  Download and place in setup/ folder:
echo    https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi
echo  Then right-click setup.bat ^> Run as Administrator
echo ======================================================
echo.
pause
exit /b 1

:node_ok
node -v
echo.

:: ---------- Step 2: Server deps ----------
echo [2/5] Installing server dependencies...
cd /d "%~dp0web\server"
call npm install
if %errorlevel% neq 0 (
    echo.
    pause
    exit /b 1
)
echo.

:: ---------- Step 3: Client deps ----------
echo [3/5] Installing client dependencies...
cd /d "%~dp0web\client"
call npm install
if %errorlevel% neq 0 (
    echo.
    pause
    exit /b 1
)
echo.

:: ---------- Step 4: Build client ----------
echo [4/5] Building client...
cd /d "%~dp0web\client"
call npx vite build
if %errorlevel% neq 0 (
    echo.
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
