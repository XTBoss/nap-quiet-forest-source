@echo off
setlocal
cd /d "%~dp0"

py -3 -c "import sys" >nul 2>&1
if %errorlevel%==0 (
  py -3 "%~dp0server.py" "%~dp0"
  goto :eof
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
if errorlevel 1 pause
