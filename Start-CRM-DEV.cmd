@echo off
setlocal ENABLEDELAYEDEXPANSION
pushd "%~dp0"
title CRM_vFinal — DEV Boot CI (Sticky)
set ST_ROOT=%CD%
set LOGDIR=%TEMP%\crm_ci
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
echo [LAUNCH] Logs: %LOGDIR%

set EXITCODE=0
where pwsh.exe >NUL 2>&1
if errorlevel 1 (
    set EXITCODE=1
    echo [ERROR] PowerShell 7 (pwsh.exe) was not found on PATH.
    echo [ERROR] Start-CRM requires PowerShell 7 to run.
    echo.
    echo Please install PowerShell 7 and retry:
    echo   https://aka.ms/powershell
    goto wait_for_exit
)

set PS=pwsh.exe
:: Keep the window open no matter what (-NoExit). Run the CI controller.
"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -NoExit -File ".\tools\Start-CRM.ps1"
set EXITCODE=%ERRORLEVEL%

:wait_for_exit
echo.
echo [LAUNCH] PowerShell returned. Press any key to close...
pause >nul
popd
endlocal & exit /b %EXITCODE%
