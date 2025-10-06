@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\Start-CRM.ps1"
if errorlevel 1 (
  echo.
  echo Launcher reported failure. Check logs under %LOCALAPPDATA%\CRM\logs or .\logs
  pause
)
endlocal
