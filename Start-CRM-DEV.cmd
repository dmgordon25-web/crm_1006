@echo off
setlocal ENABLEDELAYEDEXPANSION
pushd "%~dp0"
title CRM_vFinal — DEV Boot CI (Sticky)
set ST_ROOT=%CD%
set LOGDIR=%TEMP%\crm_ci
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
echo [LAUNCH] Logs: %LOGDIR%
where pwsh.exe >NUL 2>&1
if %ERRORLEVEL%==0 ( set PS=pwsh.exe ) else ( set PS=powershell.exe )

:: Keep the window open no matter what (-NoExit). Run the CI controller.
"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File ".\tools\Start-CRM.ps1"

echo.
echo [LAUNCH] PowerShell returned. Press any key to close...
pause >nul
popd
endlocal
