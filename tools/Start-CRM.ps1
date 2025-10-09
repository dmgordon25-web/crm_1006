#requires -version 5.1
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

# Transcript (single run log passed by %CRM_RUNLOG%)
try {
  if ($env:CRM_RUNLOG) {
    $dir = Split-Path -Parent $env:CRM_RUNLOG
    if (Test-Path -LiteralPath $dir) {
      Start-Transcript -Path $env:CRM_RUNLOG -Append -ErrorAction SilentlyContinue | Out-Null
    }
  }
} catch { }

function Say([string]$m,[string]$lvl='INFO') {
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $fg = 'Gray'
  if ($lvl -eq 'WARN') {
    $fg = 'Yellow'
  } elseif ($lvl -eq 'ERROR') {
    $fg = 'Red'
  }
  Write-Host "$ts [$lvl] $m" -ForegroundColor $fg
}

function Stop-ServerProcess {
  if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
    try {
      Stop-Process -Id $script:ServerProcess.Id -ErrorAction SilentlyContinue | Out-Null
    } catch { }
    try { $script:ServerProcess.Dispose() } catch { }
  }
  $script:ServerProcess = $null
}

function Fail([int]$code,[string]$reason,[string]$resolution) {
  Stop-ServerProcess
  Say "CODE $code — $reason" 'ERROR'
  if ($resolution) {
    Write-Host 'Resolution:' -ForegroundColor Yellow
    Write-Host $resolution -ForegroundColor Yellow
  }
  try { Stop-Transcript | Out-Null } catch { }
  exit $code
}

$script:StdOutPath = $null
$script:StdErrPath = $null
$script:RepoRoot = $null
$script:WebRoot = $null
$script:IndexPath = $null
$script:ServerProcess = $null

function Invoke-Main {
  $script:RepoRoot = (Get-Item -LiteralPath $PSScriptRoot).Parent.FullName
  $script:WebRoot = Join-Path $script:RepoRoot 'crm-app'
  $script:IndexPath = Join-Path $script:WebRoot 'index.html'
  $JsRoot = Join-Path $script:WebRoot 'js'

  $LogsDir = Join-Path $env:LOCALAPPDATA 'CRM\logs'
  New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
  $Stamp  = Get-Date -Format 'yyyyMMdd_HHmmss'
  $Base   = Join-Path $LogsDir "launcher_$Stamp"
  $script:StdOutPath = "$Base.out.log"
  $script:StdErrPath = "$Base.err.log"

  Say "Repo: $script:RepoRoot"
  Say "Web : $script:WebRoot"

  if (-not (Test-Path -LiteralPath $script:WebRoot)) {
    Fail 10 "Web root missing: $script:WebRoot" "Restore the repo folder so 'crm-app\' exists."
  }
  if (-not (Test-Path -LiteralPath $script:IndexPath)) {
    Fail 10 "Missing 'crm-app\index.html'." "Add/restore index.html and rerun."
  }
  try {
    $size = (Get-Item -LiteralPath $script:IndexPath).Length
    if ($size -lt 50) {
      Fail 10 "index.html appears empty or truncated ($size bytes)." "Replace with a valid index.html (should be several KB at least)."
    }
  } catch {
    Fail 10 "Cannot read index.html: $_" "Fix file permissions and rerun."
  }

  $Loader   = Join-Path $JsRoot 'boot\loader.js'
  $Manifest = Join-Path $JsRoot 'boot\manifest.js'
  if (-not (Test-Path -LiteralPath $Loader)) {
    Fail 11 "Missing js\boot\loader.js" "Restore boot/loader.js (SafeBoot requires it)."
  }
  if (-not (Test-Path -LiteralPath $Manifest)) {
    Fail 11 "Missing js\boot\manifest.js" "Restore boot/manifest.js with CORE/PATCHES arrays."
  }

  $bad = @()
  $merge = @()
  $patch = @()
  $ghost = @()
  Get-ChildItem -LiteralPath $JsRoot -Recurse -File -Include *.js,*.mjs | ForEach-Object {
    $t = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
    if ($t -match '…') { $bad += $_.FullName }
    if ($t -match '<<<<<<<|>>>>>>>|=======') { $merge += $_.FullName }
    if ($t -match 'import\s+.*patch_\d{4}-\d{2}-\d{2}') { $patch += $_.FullName }
    if ($t -match "import\s+['\"]\./documents\.js['\"]") { $ghost += $_.FullName }
  }
  if ($bad.Count) {
    Fail 20 "Unicode ellipsis found in JS (U+2026) which breaks parsing." ("Edit these files to replace the character with ASCII or remove it:`n  " + ($bad -join "`n  "))
  }
  if ($merge.Count) {
    Fail 21 "Git merge markers present in JS." ("Clean these files of <<<<<, >>>>>, ======:`n  " + ($merge -join "`n  "))
  }
  if ($patch.Count) {
    Fail 22 "Dev-only patch imports detected (SafeBoot off)." ("Remove direct imports of 'patch_YYYY-MM-DD_*.js' from:`n  " + ($patch -join "`n  ") + "`nUse manifest gating instead.")
  }
  if ($ghost.Count) {
    Fail 23 "Missing module './documents.js' is imported." ("Remove or replace that import in:`n  " + ($ghost -join "`n  ") + "`nUse existing doc_checklist services instead.")
  }

  $Port = $null
  for ($p = 8080; $p -le 8099; $p++) {
    try {
      $tcp = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $p)
      $tcp.Start()
      $tcp.Stop()
      $Port = $p
      break
    } catch { }
  }
  if (-not $Port) {
    Fail 30 "No free port in 8080–8099." "Close other apps using those ports or widen the range in Start-CRM.ps1."
  }
  $BaseUrl  = "http://127.0.0.1:$Port/"
  $CacheBust = [Guid]::NewGuid().ToString('N')
  $IndexUrl = "${BaseUrl}index.html?cb=$CacheBust"

  Say "Port : $Port"

  $Mime = @{
    '.html' = 'text/html'; '.htm' = 'text/html'; '.css' = 'text/css'; '.js' = 'application/javascript'
    '.mjs' = 'application/javascript'; '.map' = 'application/json'; '.json' = 'application/json'
    '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
    '.gif' = 'image/gif'; '.ico' = 'image/x-icon'; '.webmanifest' = 'application/manifest+json'
    '.txt' = 'text/plain'; '.csv' = 'text/csv'; '.wasm' = 'application/wasm'
  }

  $EscRoot = $script:WebRoot -replace '\\', '\\'
  $ServerScript = @"
Add-Type -AssemblyName System.Net.HttpListener
Add-Type -AssemblyName System.Web
`$h = New-Object System.Net.HttpListener
`$h.Prefixes.Add('http://127.0.0.1:$Port/')
`$h.Start()

function Get-MimeType([string]`$path) {
  switch ([System.IO.Path]::GetExtension(`$path).ToLower()) {
$( $Mime.Keys | ForEach-Object { "    '$_' { return '$($Mime[$_])' }" } )
    default { return 'application/octet-stream' }
  }
}
function Send-File([System.Net.HttpListenerContext]`$ctx, [string]`$fs) {
  try {
    if (-not (Test-Path -LiteralPath `$fs)) { `$ctx.Response.StatusCode = 404; return }
    `$bytes = [System.IO.File]::ReadAllBytes(`$fs)
    `$ctx.Response.ContentType = Get-MimeType -path `$fs
    `$ctx.Response.ContentLength64 = `$bytes.Length
    `$ctx.Response.StatusCode = 200
    `$ctx.Response.Headers['Cache-Control'] = 'no-cache'
    `$ctx.Response.OutputStream.Write(`$bytes,0,`$bytes.Length)
  } catch { `$ctx.Response.StatusCode = 500 }
  finally {
    try { `$ctx.Response.OutputStream.Close() } catch {}
    try { `$ctx.Response.Close() } catch {}
  }
}
try {
  while (`$true) {
    `$ctx = `$h.GetContext()
    `$raw = `$ctx.Request.Url.AbsolutePath
    `$path = [System.Uri]::UnescapeDataString(`$raw).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace(`$path)) { `$path = 'index.html' }
    if (`$path.EndsWith('/')) { `$path = `$path + 'index.html' }
    `$fs = Join-Path '$EscRoot' `$path
    if (-not (Test-Path -LiteralPath `$fs)) {
      if (Test-Path -LiteralPath (Join-Path '$EscRoot' `$path 'index.html')) {
        `$fs = Join-Path (Join-Path '$EscRoot' `$path) 'index.html'
      }
    }
    Send-File `$ctx `$fs
  }
} catch { }
"@

  Say 'Starting embedded static server'
  $powerShellExe = Join-Path $PSHOME 'powershell.exe'
  if (-not (Test-Path -LiteralPath $powerShellExe)) {
    $powerShellExe = 'powershell.exe'
  }
  $Args = @('-NoProfile','-ExecutionPolicy','Bypass','-Command',$ServerScript)
  $script:ServerProcess = Start-Process -FilePath $powerShellExe -ArgumentList $Args -WorkingDirectory $script:RepoRoot `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $script:StdOutPath -RedirectStandardError $script:StdErrPath

  Start-Sleep -Milliseconds 300
  if (-not $script:ServerProcess -or $script:ServerProcess.HasExited) {
    Fail 40 "Failed to start embedded static server." ("Open logs:`n  $script:StdOutPath`n  $script:StdErrPath`nIf Anti-Virus blocks HttpListener, allow PowerShell for loopback or run as admin.")
  }

  $ready = $false
  for ($i = 0; $i -lt 20; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $IndexUrl -TimeoutSec 1
      if ($r.StatusCode -eq 200 -and ($r.Content -match '<html' -or $r.RawContentLength -gt 800)) {
        $ready = $true
        break
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  if (-not $ready) {
    Fail 41 "Server did not return 200/HTML for $IndexUrl within timeout." ("Check for console errors in devtools once served; verify index.html loads standalone by hitting $BaseUrl then /index.html. See:`n  $script:StdOutPath`n  $script:StdErrPath")
  }

  Say "Ready check OK → $IndexUrl"

  if (-not $NoBrowser) {
    $Opened = $false
    $c1 = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    $c2 = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
    $e1 = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    $e2 = "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
    foreach ($b in @($c1,$c2,$e1,$e2)) {
      if (-not $Opened -and (Test-Path -LiteralPath $b)) {
        Start-Process -FilePath $b -ArgumentList @('--new-window',$IndexUrl) | Out-Null
        $Opened = $true
      }
    }
    if (-not $Opened) {
      try {
        Start-Process $IndexUrl | Out-Null
        $Opened = $true
      } catch { }
    }
    if (-not $Opened) {
      Fail 50 "Unable to open a browser to $IndexUrl." "Open manually: $IndexUrl"
    }
    Say "Browser launched → $IndexUrl"
  } else {
    Say "No-browser mode: server at $BaseUrl"
  }

  Say "stdout -> $script:StdOutPath"
  Say "stderr -> $script:StdErrPath"
  Say 'Server running. Close this window or press Ctrl+C to stop.'

  try {
    while (-not $script:ServerProcess.HasExited) {
      Start-Sleep -Milliseconds 500
    }
    Say "Server exited with code $($script:ServerProcess.ExitCode)"
  } finally { }

  try { Stop-Transcript | Out-Null } catch { }
  exit 0
}

try {
  Invoke-Main
} catch {
  $message = $_.Exception.Message
  Stop-ServerProcess
  $logs = @()
  if ($env:CRM_RUNLOG) { $logs += $env:CRM_RUNLOG }
  if ($script:StdOutPath) { $logs += $script:StdOutPath }
  if ($script:StdErrPath) { $logs += $script:StdErrPath }
  $resolution = if ($logs.Count) {
    "Open these logs:`n  " + ($logs -join "`n  ")
  } else {
    'Re-run Start-CRM.bat after restoring the repo and check the launcher output.'
  }
  Fail 90 "Unexpected launcher failure: $message" $resolution
}
