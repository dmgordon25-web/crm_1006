@echo off
setlocal enableextensions
pushd "%~dp0"

set "LOGDIR=%LOCALAPPDATA%\CRM\logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>nul

for /f "tokens=1-6 delims=/-:., " %%a in ("%date% %time%") do set "STAMP=%%f%%b%%c_%%d%%e%%a"
set "RUNLOG=%LOGDIR%\launcher_%STAMP%.run.log"
set "CRM_RUNLOG=%RUNLOG%"

echo [INFO] Run log: "%RUNLOG%"
echo [INFO] Launching hardened PowerShell server...

REM Use start /wait to ensure we get an exit code and the window stays if PS dies.
start "" /wait powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tools\Start-CRM.ps1" %*
set "EXITCODE=%ERRORLEVEL%"

echo.
echo Exit code: %EXITCODE%
echo Run log : "%RUNLOG%"
echo Logs dir: "%LOGDIR%"

echo.
echo --------- tail of run log ---------
powershell -NoProfile -Command "try { Get-Content -LiteralPath '%RUNLOG%' -Tail 80 } catch { }"
echo --------- end tail ---------------

if not "%EXITCODE%"=="0" (
  echo.
  echo [ERROR] CRM did not launch successfully (code %EXITCODE%). See the red reason above and open:
  echo   "%RUNLOG%"
  echo.
  pause
) else (
  echo.
  echo [INFO] CRM launched successfully. Window will remain while the server runs.
  echo   "%RUNLOG%"
  echo.
)

popd
endlocal
