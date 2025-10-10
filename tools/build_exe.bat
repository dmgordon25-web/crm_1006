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
dotnet publish launcher_exe\CRM.Launcher.csproj -c Release -r win-x64 ^
  -p:PublishSingleFile=true -p:SelfContained=true -p:PublishTrimmed=true -p:DebugType=None ^
  -o dist
if errorlevel 1 (
  echo [ERROR] Build failed.
  exit /b 3
)
if not exist dist\CRM.exe (
  echo [ERROR] Expected dist\CRM.exe not found.
  exit /b 4
)
echo [OK] Built dist\CRM.exe
popd
endlocal
