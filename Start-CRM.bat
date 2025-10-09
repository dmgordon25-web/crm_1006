@echo off
setlocal
pushd "%~dp0"
set "LOGDIR=%LOCALAPPDATA%\CRM\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>nul
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File ".\tools\Start-CRM.ps1"
popd
endlocal
