@echo off
setlocal
pushd %~dp0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tools\Start-CRM.ps1"
popd
endlocal
