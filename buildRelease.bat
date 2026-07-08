@echo off
cd /d "%~dp0"
title Yi-Lin Build Release

echo.
echo ========================================
echo      Building Yi-Lin Desktop Release
echo ========================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Run setup.bat first.
    pause
    exit /b 1
)

echo [1/4] Building client...
cd /d "%~dp0web\client"
call npx vite build
if %errorlevel% neq 0 (
    echo [ERROR] Client build failed.
    pause
    exit /b 1
)
echo.

echo [2/4] Compiling server...
cd /d "%~dp0web\server"
call npx tsc
if %errorlevel% neq 0 (
    echo [ERROR] Server compilation failed.
    pause
    exit /b 1
)
echo.

echo [3/4] Building desktop package...
cd /d "%~dp0desktop"
call node scripts\copy-server.js
if %errorlevel% neq 0 (
    echo [ERROR] Resource copy failed.
    pause
    exit /b 1
)
echo.

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
