@echo off
setlocal
pushd "%~dp0\.."
if not exist launcher_exe\CRM.Launcher.csproj (
  echo [ERROR] launcher_exe\CRM.Launcher.csproj missing.
  exit /b 1
)
dotnet --version >nul 2>nul
if errorlevel 1 (
  echo [ERROR] .NET SDK not found. Install .NET 8 SDK to build the EXE.
  exit /b 2
)
echo [INFO] Publishing self-contained single-file EXE...
if not exist dist mkdir dist
set PUBLISH_LOG=%TEMP%\crm_launcher_publish.log
if exist "%PUBLISH_LOG%" del "%PUBLISH_LOG%"
dotnet publish launcher_exe\CRM.Launcher.csproj -c Release -r win-x64 ^
  -p:PublishSingleFile=true -p:SelfContained=true -p:PublishTrimmed=true -p:DebugType=None ^
  -o dist >"%PUBLISH_LOG%" 2>&1
set PUBRESULT=%ERRORLEVEL%
type "%PUBLISH_LOG%"
if %PUBRESULT% NEQ 0 (
  echo [ERROR] Build failed. See %PUBLISH_LOG% for details.
  exit /b 3
)
copy /Y "%PUBLISH_LOG%" dist\publish.log >nul 2>nul
if not exist dist\CRM.exe (
  echo [ERROR] Expected dist\CRM.exe not found.
  exit /b 4
)
echo [OK] Built dist\CRM.exe
echo [INFO] Publish log copied to dist\publish.log
popd
endlocal
