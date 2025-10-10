@echo off
setlocal
pushd "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\tools\Start-CRM.ps1"
set "exitCode=%ERRORLEVEL%"
popd
endlocal & exit /b %exitCode%
