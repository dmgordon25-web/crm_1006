#requires -version 5.1
$ErrorActionPreference = 'Stop'

function Say([string]$msg, [string]$lvl='INFO') {
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $color = 'Gray'; if ($lvl -eq 'WARN') { $color='Yellow' } elseif ($lvl -eq 'ERROR') { $color='Red' } elseif ($lvl -eq 'OK') { $color='Green' }
  Write-Host "$ts [$lvl] $msg" -ForegroundColor $color
}
function Pause-Exit([int]$code) { [void](Read-Host 'Press Enter to exit'); exit $code }
function Fail([string]$reason, [int]$code=1) { Say $reason 'ERROR'; Pause-Exit $code }
function Is-Admin() {
  try { return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator) } catch { return $false }
}

# Resolve paths
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$WebRoot  = (Resolve-Path -LiteralPath (Join-Path $RepoRoot 'crm-app')).Path
$Index    = Join-Path $WebRoot 'index.html'
$JsRoot   = Join-Path $WebRoot 'js'

Say "Repo: $RepoRoot"
Say "Web : $WebRoot"

# Preflight
if (-not (Test-Path -LiteralPath $WebRoot)) { Fail "Missing folder: crm-app" 10 }
if (-not (Test-Path -LiteralPath $Index))   { Fail "Missing file: crm-app\index.html" 10 }
try {
  $len = (Get-Item -LiteralPath $Index).Length
  if ($len -lt 50) { Fail "index.html looks empty ($len bytes)" 10 }
} catch { Fail ("Cannot read index.html: " + $_.Exception.Message) 10 }

if (-not (Test-Path -LiteralPath (Join-Path $JsRoot 'boot\loader.js')))   { Fail "Missing js\boot\loader.js" 11 }
if (-not (Test-Path -LiteralPath (Join-Path $JsRoot 'boot\manifest.js'))) { Fail "Missing js\boot\manifest.js" 11 }

# Light scan for common breakages (no Unicode chars in script)
$bad=@(); $merge=@(); $patch=@(); $ghost=@()
Get-ChildItem -LiteralPath $JsRoot -Recurse -File -Include *.js,*.mjs | ForEach-Object {
  $t = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
  if ($t -match "`u2026") { $bad += $_.FullName } # U+2026 ellipsis
  if ($t -match '<<<<<<<|>>>>>>>|======') { $merge += $_.FullName }
  if ($t -match 'import\s+.*patch_\d{4}-\d{2}-\d{2}') { $patch += $_.FullName }
  if ($t -match 'import\s+["'']\./documents\.js["'']') { $ghost += $_.FullName }
}
if ($bad.Count)   { Fail ("Unicode ellipsis found in JS. Fix files:" + [Environment]::NewLine + "  " + ($bad -join [Environment]::NewLine + "  ")) 20 }
if ($merge.Count) { Fail ("Git merge markers present. Fix files:" + [Environment]::NewLine + "  " + ($merge -join [Environment]::NewLine + "  ")) 21 }
if ($patch.Count) { Fail ("Dev-only patch imports present. Fix files:" + [Environment]::NewLine + "  " + ($patch -join [Environment]::NewLine + "  ")) 22 }
if ($ghost.Count) { Fail ("Missing module './documents.js' imported in:" + [Environment]::NewLine + "  " + ($ghost -join [Environment]::NewLine + "  ")) 23 }

# Pick free port 8080..8099, then 8100..8199
$Port = $null
foreach ($range in @((8080..8099),(8100..8199))) {
  foreach ($p in $range) {
    try { $tcp = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$p); $tcp.Start(); $tcp.Stop(); $Port=$p; break } catch {}
  }
  if ($Port) { break }
}
if (-not $Port) { Fail "No free port in 8080..8199" 30 }
$BaseUrl  = "http://127.0.0.1:$Port/"
$IndexUrl = $BaseUrl + "index.html?cb=" + ([Guid]::NewGuid().ToString('N'))

# HttpListener with URLACL self-heal
Add-Type -AssemblyName System.Net.HttpListener
$listener = New-Object System.Net.HttpListener
$prefix   = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
try {
  $listener.Start()
} catch {
  $msg = $_.Exception.Message
  if ($msg -match 'Access is denied' -or $msg -match 'denied') {
    if (-not (Is-Admin)) {
      Say "Permission needed to reserve URL. Requesting UAC once..." 'WARN'
      $aclCmd = "netsh http add urlacl url=$prefix user=$env:UserDomain\$env:UserName listen=yes"
      try {
        Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList "-NoProfile","-Command",$aclCmd -Wait
      } catch { Fail ("URL ACL add failed: " + $_.Exception.Message) 40 }
      try { $listener.Start() } catch { Fail ("Could not start server after URL ACL: " + $_.Exception.Message) 40 }
    } else {
      & netsh http add urlacl url=$prefix user="$env:UserDomain\$env:UserName" listen=yes | Out-Null
      try { $listener.Start() } catch { Fail ("Could not start server after URL ACL: " + $_.Exception.Message) 40 }
    }
  } else {
    Fail ("Could not start server: " + $msg) 40
  }
}

# MIME map
$Mime = @{
  '.html'='text/html'; '.htm'='text/html'; '.css'='text/css'; '.js'='application/javascript'
  '.mjs'='application/javascript'; '.map'='application/json'; '.json'='application/json'
  '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'
  '.gif'='image/gif'; '.ico'='image/x-icon'; '.webmanifest'='application/manifest+json'
  '.txt'='text/plain'; '.csv'='text/csv'; '.wasm'='application/wasm'
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf'
}
function Get-Mime([string]$p) { $e=[IO.Path]::GetExtension($p).ToLower(); if ($Mime.ContainsKey($e)) { $Mime[$e] } else { 'application/octet-stream' } }

# Launch browser
$opened = $false
$tryList = @(
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
)
foreach ($b in $tryList) {
  if (-not $opened -and (Test-Path -LiteralPath $b)) {
    try { Start-Process -FilePath $b -ArgumentList @('--new-window',$IndexUrl) | Out-Null; $opened=$true } catch {}
  }
}
if (-not $opened) {
  try { Start-Process $IndexUrl | Out-Null; $opened=$true } catch {}
}
if (-not $opened) {
  $fileUrl = (Get-Item -LiteralPath $Index).FullName
  Say "HTTP open failed; trying file:// fallback" 'WARN'
  try { Start-Process $fileUrl | Out-Null; $opened=$true } catch {}
  if (-not $opened) { Fail ("Unable to open a browser. Open manually: " + $IndexUrl + " or " + $fileUrl) 50 }
}

Say ("Server up: " + $BaseUrl) 'OK'
Say ("Opening: " + $IndexUrl) 'OK'
Write-Host ""

# Simple serve loop (Ctrl+C to stop)
while ($true) {
  try {
    $ctx  = $listener.GetContext()
    $raw  = $ctx.Request.Url.AbsolutePath
    $path = [System.Uri]::UnescapeDataString($raw).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
    if ($path.EndsWith('/')) { $path = $path + 'index.html' }
    $fs = Join-Path $WebRoot $path
    if (-not (Test-Path -LiteralPath $fs)) {
      $alt = Join-Path (Join-Path $WebRoot $path) 'index.html'
      if (Test-Path -LiteralPath $alt) { $fs = $alt }
    }
    if (Test-Path -LiteralPath $fs) {
      $bytes = [System.IO.File]::ReadAllBytes($fs)
      $ctx.Response.ContentType = Get-Mime $fs
      $ctx.Response.Headers['Cache-Control'] = 'no-cache'
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.StatusCode = 200
      $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch {
    try { $ctx.Response.StatusCode = 500 } catch {}
  } finally {
    try { $ctx.Response.OutputStream.Close() } catch {}
    try { $ctx.Response.Close() } catch {}
  }
}

# Cleanup (normally on Ctrl+C)
try { $listener.Stop() } catch {}
Say "Server stopped."
Pause-Exit 0
