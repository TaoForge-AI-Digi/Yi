@echo off
cd /d "%~dp0"
title Yi-Lin Restart

:: Kill anything on port 3001 (server) and 5173 (client)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

timeout /t 1 /nobreak >nul

:: Build server
echo Building Server ...
cd /d %~dp0web\server
call npx tsc
if %errorlevel% neq 0 (
    echo Server build failed!
    pause
    exit /b %errorlevel%
)

:: Build client
echo Building Client ...
cd /d %~dp0web\client
call npx vite build
if %errorlevel% neq 0 (
    echo Client build failed!
    pause
    exit /b %errorlevel%
)

:: Run
echo Starting Yi-Lin Server on :3001 ...
start "Yi-Lin Server" cmd /k "set DATA_DIR=%~dp0data && cd /d %~dp0web\server && npx tsx src\index.ts"

timeout /t 2 /nobreak >nul

echo Starting Yi-Lin Client on :5173 ...
start "Yi-Lin Client" cmd /k "cd /d %~dp0web\client && npx vite"

echo.
echo Server :3001  | Client :5173
echo Close this window to stop both.
