@echo off
cd /d "%~dp0"
title Yi-Lin

:: Kill anything on port 3001 (server) and 5173 (client)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

timeout /t 1 /nobreak >nul

echo Starting Yi-Lin Server on :3001 ...
start "Yi-Lin Server" cmd /k "cd /d %~dp0apps\server && npx tsx src\index.ts"

timeout /t 2 /nobreak >nul

echo Starting Yi-Lin Client on :5173 ...
start "Yi-Lin Client" cmd /k "cd /d %~dp0apps\client && npx vite"

echo.
echo Server :3001  | Client :5173
echo Close this window to stop both.
