@echo off
title WinMend (http://localhost:8093)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed. Download the LTS version from https://nodejs.org
  echo  install it, then double-click this file again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)
echo Starting WinMend on http://localhost:8093 ... (close this window to stop)
node scripts\run-local.js
pause
