#requires -version 5.1
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

function Log { param([string]$msg,[string]$lvl='INFO')
  $ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  Write-Host "$ts [$lvl] $msg"
}

# Resolve roots
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$webRoot  = (Resolve-Path -LiteralPath (Join-Path $repoRoot 'crm-app')).Path
$logsDir  = Join-Path $env:LOCALAPPDATA 'CRM\logs'
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

# Unique log pair
$stamp   = Get-Date -Format 'yyyyMMdd_HHmmss'
$base    = Join-Path $logsDir "launcher_$stamp"
$stdout  = "$base.out.log"
$stderr  = "$base.err.log"

Log "Resolved repo root: $repoRoot"
Log "Using web root: $webRoot"

# Pick a port (8080..8090)
$port = 8080
for ($p=8080; $p -le 8090; $p++) {
  try { $tcp = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$p); $tcp.Start(); $tcp.Stop(); $port=$p; break } catch {}
}

# Locate node (optional)
$nodeExe = $null
$nodeCandidates = @(
  "$env:ProgramFiles\nodejs\node.exe",
  "$env:ProgramFiles(x86)\nodejs\node.exe",
  (Get-Command node.exe -ErrorAction SilentlyContinue)?.Source
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if ($nodeCandidates) { $nodeExe = $nodeCandidates }

# Decide server strategy
$serverJs = Join-Path $PSScriptRoot 'node_static_server.js'
$useNode  = $nodeExe -and (Test-Path -LiteralPath $serverJs)

$url = "http://127.0.0.1:$port/"

# Launch server
if ($useNode) {
  Log "Launching Node static server via $nodeExe"
  $args = @("$serverJs","--root",$webRoot,"--port","$port")
  # IMPORTANT: RedirectStandardOutput and RedirectStandardError must be DIFFERENT files
  $proc = Start-Process -FilePath $nodeExe -ArgumentList $args -WorkingDirectory $repoRoot `
          -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
}
else {
  Log "Node not found or server script missing; using PowerShell Simple HTTP listener"
  $serverScript = @"
Add-Type -AssemblyName System.Net.HttpListener
\$h = New-Object System.Net.HttpListener
\$h.Prefixes.Add('http://127.0.0.1:$($port)/')
\$h.Start()
while (\$true) {
  \$ctx = \$h.GetContext()
  \$path = [System.Web.HttpUtility]::UrlDecode(\$ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ([string]::IsNullOrWhiteSpace(\$path)) { \$path = 'index.html' }
  \$fsPath = Join-Path '$($webRoot -replace '\\','\\')' \$path
  if (-not (Test-Path -LiteralPath \$fsPath)) { \$ctx.Response.StatusCode = 404; \$ctx.Response.Close(); continue }
  \$bytes = [System.IO.File]::ReadAllBytes(\$fsPath)
  \$ctx.Response.ContentLength64 = \$bytes.Length
  \$ctx.Response.OutputStream.Write(\$bytes,0,\$bytes.Length)
  \$ctx.Response.Close()
}
"@
  $proc = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile","-ExecutionPolicy","Bypass","-Command",$serverScript) `
          -WorkingDirectory $repoRoot -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
}

Start-Sleep -Milliseconds 400
if (-not $proc -or $proc.HasExited) {
  Log "Failed to start server process; see $stdout and $stderr" 'ERROR'
  Exit 1
}

# Open browser (Chrome → Edge → default)
$indexUrl = "${url}index.html"
$opened = $false
$chrome = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
$chrome2= "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
$edge   = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$edge2  = "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
foreach ($b in @($chrome,$chrome2,$edge,$edge2)) {
  if (-not $opened -and (Test-Path -LiteralPath $b)) {
    Start-Process -FilePath $b -ArgumentList @("--new-window",$indexUrl) | Out-Null
    $opened = $true
  }
}
if (-not $opened) { Start-Process $indexUrl | Out-Null }

Log "Server up on $url"
Log "Browser launched with $indexUrl"
Log "stdout -> $stdout"
Log "stderr -> $stderr"

# Keep console attached until user closes browser or Ctrl+C
try {
  while (-not $proc.HasExited) { Start-Sleep -Milliseconds 500 }
} finally {
  if ($proc -and -not $proc.HasExited) { $proc.CloseMainWindow() | Out-Null }
}
Exit 0

# EOF
