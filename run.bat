@echo off
cd /d "%~dp0"
title Yi-Lin

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Run setup.bat first.
    pause
    exit /b 1
)
if not exist "%~dp0web\server\node_modules" (
    echo [ERROR] Server dependencies not found. Run setup.bat first.
    pause
    exit /b 1
)
if not exist "%~dp0web\client\node_modules" (
    echo [ERROR] Client dependencies not found. Run setup.bat first.
    pause
    exit /b 1
)
if not exist "%~dp0web\client\dist" (
    echo [WARNING] Client not built. Building now...
    cd /d "%~dp0web\client"
    call npx vite build || (
        echo [ERROR] Client build failed.
        pause
        exit /b 1
    )
    cd /d "%~dp0"
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1
timeout /t 1 /nobreak >nul
echo Starting Yi-Lin Server on :3001 ...
start "Yi-Lin Server" cmd /k "set DATA_DIR=%~dp0data && cd /d %~dp0web\server && npx tsx src\index.ts"
timeout /t 2 /nobreak >nul
echo Starting Yi-Lin Client on :5173 ...
start "Yi-Lin Client" cmd /k "cd /d %~dp0web\client && npx vite"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
echo.
echo Server :3001  | Client :5173
echo Close this window to stop both.
