@echo off
cd /d "%~dp0"
title Yi-Lin Setup

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator privileges...
    powershell start -verb runas "%~f0" 2>nul
    exit /b
)

echo.
echo ========================================
echo        Yi-Lin Environment Setup
echo ========================================
echo.

echo [1/5] Checking Node.js...
where node >nul 2>&1
if %errorlevel% equ 0 goto node_ok

if exist setup\*.msi (
    for %%f in (setup\*.msi) do (
        echo Found: %%~nxf
        echo Installing Node.js...
        msiexec /i "%%f" /quiet /norestart
        if %errorlevel% equ 0 (
            echo Node.js installed.
            set "PATH=%PATH%;C:\Program Files\nodejs\;C:\Program Files (x86)\nodejs\"
            where node >nul 2>&1
            if %errorlevel% equ 0 goto node_ok
        )
    )
)

echo.
echo ============================================
echo  Node.js installation failed.
echo  Download and place in setup/ folder:
echo    https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi
echo  Then run setup.bat again.
echo ============================================
echo.
pause
exit /b 1

:node_ok
node -v
echo.

echo [2/5] Installing server dependencies...
cd /d "%~dp0web\server"
call npm install
if %errorlevel% neq 0 (
    echo.
    pause
    exit /b 1
)
echo.

echo [3/5] Installing client dependencies...
cd /d "%~dp0web\client"
call npm install
if %errorlevel% neq 0 (
    echo.
    pause
    exit /b 1
)
echo.

echo [4/5] Building client...
cd /d "%~dp0web\client"
call npx vite build
if %errorlevel% neq 0 (
    echo.
    pause
    exit /b 1
)
echo.

echo [5/5] Setup complete!
echo.
echo You can now run:  run.bat
echo.
pause
