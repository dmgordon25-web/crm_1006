@echo off
setlocal
pushd "%~dp0"
where pwsh.exe >nul 2>nul
if %errorlevel%==0 (
  pwsh.exe -NoLogo -NoProfile -File ".\tools\Start-CRM.ps1" %*
) else (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File ".\tools\Start-CRM.ps1" %*
)
popd
endlocal
