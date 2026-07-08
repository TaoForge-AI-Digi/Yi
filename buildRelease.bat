@echo off
cd /d "%~dp0"
title Yi-Lin Build Release

echo.
echo ========================================
echo      Building Yi-Lin Desktop Release
echo ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Run setup.bat first.
    pause
    exit /b 1
)

:: Step 1: Build client
echo [1/4] Building client...
cd /d "%~dp0web\client"
call npx vite build
if %errorlevel% neq 0 (
    echo [ERROR] Client build failed.
    pause
    exit /b 1
)
echo.

:: Step 2: Compile server
echo [2/4] Compiling server...
cd /d "%~dp0web\server"
call npx tsc
if %errorlevel% neq 0 (
    echo [ERROR] Server compilation failed.
    pause
    exit /b 1
)
echo.

:: Step 3: Copy resources and build desktop
echo [3/4] Building desktop package...
cd /d "%~dp0desktop"
call node scripts\copy-server.js
if %errorlevel% neq 0 (
    echo [ERROR] Resource copy failed.
    pause
    exit /b 1
)
echo.

:: Step 4: Package
echo [4/4] Packaging Electron app...
npx electron-builder --win --x64 --dir
if %errorlevel% neq 0 (
    echo [ERROR] Packaging failed.
    pause
    exit /b 1
)
echo.

echo ========================================
echo  Build complete!
echo  Output: desktop\release\win-unpacked\弈.exe
echo ========================================
echo.
pause
