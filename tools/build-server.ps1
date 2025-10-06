Param()
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
Set-Location $repoRoot

Write-Host "Publishing Start CRM launcher (win-x64 single file)..."
$publishArgs = @(
    "publish",
    "tools/server/ServerApp.csproj",
    "-c","Release",
    "-r","win-x64",
    "--self-contained","true",
    "-p:PublishSingleFile=true",
    "-p:IncludeNativeLibrariesForSelfExtract=true",
    "-p:EnableCompressionInSingleFile=true",
    "-o","."
)

dotnet @publishArgs

$sourceExe = Join-Path $repoRoot "ServerApp.exe"
$targetExe = Join-Path $repoRoot "Start CRM.exe"

if (Test-Path $targetExe) {
    Remove-Item $targetExe -Force
}

if (!(Test-Path $sourceExe)) {
    throw "Expected published executable not found: $sourceExe"
}

Rename-Item -Path $sourceExe -NewName "Start CRM.exe"

Write-Host "Build complete: $targetExe"
Write-Host "Verify manually with: .\Start` CRM.exe --port 0 --open false"
