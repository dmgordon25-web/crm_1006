#requires -version 5.1
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

function Log { param([string]$msg,[string]$lvl='INFO')
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  Write-Host "$ts [$lvl] $msg"
}

# Resolve paths
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$WebRoot  = (Resolve-Path -LiteralPath (Join-Path $RepoRoot 'crm-app')).Path
if (-not (Test-Path -LiteralPath $WebRoot)) {
  Log "Web root not found: $WebRoot" 'ERROR'; exit 1
}

# Logs
$LogsDir = Join-Path $env:LOCALAPPDATA 'CRM\logs'
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
$Stamp  = Get-Date -Format 'yyyyMMdd_HHmmss'
$Base   = Join-Path $LogsDir "launcher_$Stamp"
$StdOut = "$Base.out.log"
$StdErr = "$Base.err.log"

Log "Resolved repo root: $RepoRoot"
Log "Using web root: $WebRoot"

# Pick free port 8080..8099
$Port = $null
for ($p=8080; $p -le 8099; $p++) {
  try { $tcp = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$p); $tcp.Start(); $tcp.Stop(); $Port=$p; break } catch {}
}
if (-not $Port) { Log "No free port in 8080..8099" 'ERROR'; exit 1 }
$Url = "http://127.0.0.1:$Port/"

# Build MIME map
$Mime = @{
  '.html'='text/html'; '.htm'='text/html'; '.css'='text/css'; '.js'='application/javascript'
  '.mjs'='application/javascript'; '.map'='application/json'; '.json'='application/json'
  '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'
  '.gif'='image/gif'; '.ico'='image/x-icon'; '.webmanifest'='application/manifest+json'
  '.txt'='text/plain'; '.csv'='text/csv'
}

# Build server script string (PS 5.1 safe)
$EscRoot = $WebRoot -replace '\\','\\'
$ServerScript = @"
Add-Type -AssemblyName System.Net.HttpListener
Add-Type -AssemblyName System.Web
`$h = New-Object System.Net.HttpListener
`$h.Prefixes.Add('http://127.0.0.1:$Port/')
`$h.Start()

function Get-MimeType([string]`$path) {
  switch ([System.IO.Path]::GetExtension(`$path).ToLower()) {
    $( $Mime.GetEnumerator() | ForEach-Object { "  '$_' { return '$($Mime[$_])' }" } )
    default { return 'application/octet-stream' }
  }
}

function Send-File([System.Net.HttpListenerContext]`$ctx, [string]`$fs) {
  try {
    `$bytes = [System.IO.File]::ReadAllBytes(`$fs)
    `$ctx.Response.ContentType = Get-MimeType -path `$fs
    `$ctx.Response.ContentLength64 = `$bytes.Length
    `$ctx.Response.StatusCode = 200
    `$ctx.Response.OutputStream.Write(`$bytes,0,`$bytes.Length)
  } catch {
    `$ctx.Response.StatusCode = 500
  } finally {
    try { `$ctx.Response.OutputStream.Close() } catch {}
    try { `$ctx.Response.Close() } catch {}
  }
}

while (`$true) {
  try {
    `$ctx = `$h.GetContext()
    `$raw = `$ctx.Request.Url.AbsolutePath
    `$path = [System.Uri]::UnescapeDataString(`$raw).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace(`$path)) { `$path = 'index.html' }
    if (`$path.EndsWith('/')) { `$path = `$path + 'index.html' }
    `$fs = Join-Path '$EscRoot' `$path

    if (-not (Test-Path -LiteralPath `$fs)) {
      # Try directory index.html
      if (Test-Path -LiteralPath (Join-Path '$EscRoot' `$path 'index.html')) {
        `$fs = Join-Path (Join-Path '$EscRoot' `$path) 'index.html'
        Send-File `$ctx `$fs
      } else {
        `$ctx.Response.StatusCode = 404
        `$ctx.Response.OutputStream.Close()
        `$ctx.Response.Close()
      }
      continue
    }

    # Simple cache headers
    `$ctx.Response.Headers['Cache-Control'] = 'no-cache'
    Send-File `$ctx `$fs
  } catch {
    try { `$ctx.Response.StatusCode = 500; `$ctx.Response.Close() } catch {}
  }
}
"@

# Start the embedded server in a child PowerShell, redirecting output to separate files
Log "Starting embedded static server"
$Args = @('-NoProfile','-ExecutionPolicy','Bypass','-Command',$ServerScript)
$Proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $Args -WorkingDirectory $RepoRoot `
        -PassThru -NoNewWindow -RedirectStandardOutput $StdOut -RedirectStandardError $StdErr

Start-Sleep -Milliseconds 400
if (-not $Proc -or $Proc.HasExited) {
  Log "Failed to start static server. See:" 'ERROR'
  Log "  $StdOut" 'ERROR'
  Log "  $StdErr" 'ERROR'
  exit 1
}

# Open browser
$IndexUrl = "${Url}index.html"
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

Log "Server up on $Url"
Log "Browser launched with $IndexUrl"
Log "stdout -> $StdOut"
Log "stderr -> $StdErr"

# Keep console attached until server exits
try {
  while (-not $Proc.HasExited) { Start-Sleep -Milliseconds 500 }
} finally {
  try { if ($Proc -and -not $Proc.HasExited) { $Proc.CloseMainWindow() | Out-Null } } catch {}
}
exit 0
