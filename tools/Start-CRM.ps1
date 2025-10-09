#requires -version 5.1
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

function Log { param([string]$m,[string]$lvl='INFO')
  $ts=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss'); $fg = ( $lvl -eq 'ERROR' ? 'Red' : ( $lvl -eq 'WARN' ? 'Yellow' : 'Gray') )
  Write-Host "$ts [$lvl] $m" -ForegroundColor $fg
}

# -------------------- Resolve paths
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$WebRoot  = (Resolve-Path -LiteralPath (Join-Path $RepoRoot 'crm-app')).Path
$Index    = Join-Path $WebRoot 'index.html'
$JsRoot   = Join-Path $WebRoot 'js'

# -------------------- Logs
$LogsDir = Join-Path $env:LOCALAPPDATA 'CRM\logs'
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
$Stamp  = Get-Date -Format 'yyyyMMdd_HHmmss'
$Base   = Join-Path $LogsDir "launcher_$Stamp"
$StdOut = "$Base.out.log"
$StdErr = "$Base.err.log"

Log "Resolved repo root: $RepoRoot"
Log "Using web root: $WebRoot"

# -------------------- PREFLIGHT (fail fast with crisp errors)
$fail = @()
if (-not (Test-Path -LiteralPath $WebRoot)) { $fail += "Web root missing: $WebRoot" }
if (-not (Test-Path -LiteralPath $Index))   { $fail += "Missing index.html at $Index" }
if (-not (Test-Path -LiteralPath $JsRoot))  { $fail += "Missing JS root at $JsRoot" }

if ($fail.Count -eq 0) {
  try {
    $len = (Get-Item -LiteralPath $Index).Length
    if ($len -lt 50) { $fail += "index.html looks empty or truncated ($len bytes)." }
  } catch { $fail += "Cannot stat index.html: $_" }
}

# Scan for show-stoppers inside JS: Unicode ellipsis (U+2026), merge markers, dev-only patch imports, ghost documents.js
if ($fail.Count -eq 0) {
  $bad = @(); $merge = @(); $patch = @(); $ghost = @()
  Get-ChildItem -LiteralPath $JsRoot -Recurse -File -Include *.js,*.mjs | ForEach-Object {
    $t = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
    if ($t -match '…')                                       { $bad   += $_.FullName }
    if ($t -match '<<<<<<<|>>>>>>>|======
')                         { $merge += $_.FullName }
    if ($t -match 'import\s+.*patch_\d{4}-\d{2}-\d{2}')      { $patch += $_.FullName }
    if ($t -match "import\s+['\"]\./documents\.js['\"]")     { $ghost += $_.FullName }
  }
  if ($bad.Count)   { $fail += "Unicode ellipsis found in:`n  " + ($bad -join "`n  ") }
  if ($merge.Count) { $fail += "Merge markers found in:`n  " + ($merge -join "`n  ") }
  if ($patch.Count) { $fail += "Dev-only patch imports present (breaks SafeBoot):`n  " + ($patch -join "`n  ") }
  if ($ghost.Count) { $fail += "Missing module import './documents.js' referenced in:`n  " + ($ghost -join "`n  ") }
}

# Check critical boot files exist
$BootLoader   = Join-Path $JsRoot 'boot\loader.js'
$BootManifest = Join-Path $JsRoot 'boot\manifest.js'
if (-not (Test-Path -LiteralPath $BootLoader))   { $fail += "Missing: js/boot/loader.js" }
if (-not (Test-Path -LiteralPath $BootManifest)) { $fail += "Missing: js/boot/manifest.js" }

if ($fail.Count) {
  Log "Preflight FAILED — fix these items:" 'ERROR'
  $fail | ForEach-Object { Log $_ 'ERROR' }
  Log "See also: $StdErr (if server was attempted) and repo docs." 'ERROR'
  exit 2
}

# -------------------- Port selection (8080–8099)
$Port = $null
for ($p=8080; $p -le 8099; $p++) {
  try { $tcp = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$p); $tcp.Start(); $tcp.Stop(); $Port=$p; break } catch {}
}
if (-not $Port) { Log "No free port in 8080..8099" 'ERROR'; exit 1 }
$BaseUrl = "http://127.0.0.1:$Port/"
# Cache-busting token prevents stale cached blank pages
$Bust = [System.Guid]::NewGuid().ToString('N')
$IndexUrl = "${BaseUrl}index.html?cb=$Bust"

# -------------------- MIME map
$Mime = @{
  '.html'='text/html'; '.htm'='text/html'; '.css'='text/css'; '.js'='application/javascript'
  '.mjs'='application/javascript'; '.map'='application/json'; '.json'='application/json'
  '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'
  '.gif'='image/gif'; '.ico'='image/x-icon'; '.webmanifest'='application/manifest+json'
  '.txt'='text/plain'; '.csv'='text/csv'; '.wasm'='application/wasm'
}

# -------------------- Embedded static server (child PowerShell)
$EscRoot = $WebRoot -replace '\\','\\'
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
  } catch {
    `$ctx.Response.StatusCode = 500
  } finally {
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
} catch {
  # Listener was probably stopped/killed by parent; exit quietly
}
"@

Log "Selected port: $Port"
Log "Starting embedded static server"
$Args = @('-NoProfile','-ExecutionPolicy','Bypass','-Command',$ServerScript)
$Proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $Args -WorkingDirectory $RepoRoot `
        -PassThru -NoNewWindow -RedirectStandardOutput $StdOut -RedirectStandardError $StdErr

Start-Sleep -Milliseconds 250
if (-not $Proc -or $Proc.HasExited) {
  Log "Failed to start static server. See:" 'ERROR'
  Log "  $StdOut" 'ERROR'
  Log "  $StdErr" 'ERROR'
  exit 1
}

# -------------------- Wait-for-ready (HTTP 200 + HTML signature) up to 15s
$ready = $false
for ($i=0; $i -lt 30; $i++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $IndexUrl -TimeoutSec 1
    if ($r.StatusCode -eq 200 -and ($r.Content -match '<html' -or $r.RawContentLength -gt 800)) { $ready = $true; break }
  } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) {
  Log "Server did not return 200/HTML for $IndexUrl within timeout." 'ERROR'
  Log "Check logs:" 'ERROR'
  Log "  $StdOut" 'ERROR'
  Log "  $StdErr" 'ERROR'
  try { if ($Proc -and -not $Proc.HasExited) { $Proc.Kill() } } catch {}
  exit 1
}
Log "Wait-for-ready OK at $IndexUrl"

# -------------------- Open browser (unless --no-browser)
if (-not $NoBrowser) {
  $Opened = $false
  $Chrome1 = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  $Chrome2 = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
  $Edge1   = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  $Edge2   = "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
  foreach ($b in @($Chrome1,$Chrome2,$Edge1,$Edge2)) {
    if (-not $Opened -and (Test-Path -LiteralPath $b)) {
      Start-Process -FilePath $b -ArgumentList @('--new-window',$IndexUrl) | Out-Null
      $Opened = $true
    }
  }
  if (-not $Opened) { Start-Process $IndexUrl | Out-Null }
  Log "Server up on $BaseUrl"
  Log "Browser launched with $IndexUrl"
} else {
  Log "Server up on $BaseUrl (no-browser mode)"
}
Log "stdout -> $StdOut"
Log "stderr -> $StdErr"

# -------------------- Keep console attached
try { while (-not $Proc.HasExited) { Start-Sleep -Milliseconds 500 } }
finally { try { if ($Proc -and -not $Proc.HasExited) { $Proc.CloseMainWindow() | Out-Null } } catch {} }
exit 0
