@echo off
cd /d "%~dp0"
title Yi-Lin

:: Build
echo Building server...
cd /d "%~dp0apps\server" || exit /b
call npm run build
if %errorlevel% neq 0 pause & exit /b %errorlevel%

echo Building client...
cd /d "%~dp0apps\client" || exit /b
call npm run build
if %errorlevel% neq 0 pause & exit /b %errorlevel%

cd /d "%~dp0"

:: Kill anything on port 3001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

timeout /t 1 /nobreak >nul
start "Yi-Lin Server" cmd /k "cd /d %~dp0apps\server && echo Server on :3001 && npx tsx src\index.ts"
timeout /t 2 /nobreak >nul
start "Yi-Lin Client" cmd /k "cd /d %~dp0apps\client && echo Client on :5173 && npx vite"
