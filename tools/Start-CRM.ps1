[CmdletBinding()]
param(
  [switch]$KeepOpen,

  # Catch-all must be BEFORE WebRoot so unlabeled args don't get swallowed
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Remaining,

  # Named-only (huge Position) + guard below
  [Parameter(Mandatory=$false, Position=2147483647)]
  [string]$WebRoot
)
# Honor -WebRoot only if explicitly passed
if (-not $PSBoundParameters.ContainsKey('WebRoot')) { $WebRoot = $null }

# ---------- hard logging scaffold ----------
$ErrorActionPreference = 'Stop'
$global:LAUNCH_FAILED = $false
try {
  $LogRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'CRM\logs' } else { Join-Path (Split-Path $PSScriptRoot -Parent) 'logs' }
  New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
} catch {
  $LogRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'logs'
  New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
}
$LogPath = Join-Path $LogRoot ("launcher-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
$StateFile = Join-Path $LogRoot 'serve-state.json'

function Write-Log([string]$msg) {
  $ts = (Get-Date).ToString('u')
  "$ts  $msg" | Tee-Object -FilePath $LogPath -Append | Out-Host
}

trap {
  $global:LAUNCH_FAILED = $true
  Write-Log ("FATAL: {0}`n{1}" -f $_.Exception.Message, $_.InvocationInfo.PositionMessage)
  continue
}

Write-Log "[BOOT] Start-CRM.ps1 begin"

# ---------- PS 5.1-safe env banner ----------
function Get-CmdName([string]$n) {
  try { $c = Get-Command $n -ErrorAction SilentlyContinue } catch { $c = $null }
  if ($c) { return $c.Name } else { return '' }
}
function Write-EnvBanner {
  if ($script:ENV_BANNER_PRINTED) { return }
  $script:ENV_BANNER_PRINTED = $true
  Write-Log ("[INFO] PSVersion={0} Arch={1}" -f $PSVersionTable.PSVersion, $env:PROCESSOR_ARCHITECTURE)
  $p  = Get-CmdName 'python'
  $py = Get-CmdName 'py'
  $nd = Get-CmdName 'node'
  Write-Log ("[INFO] Paths: python={0} py={1} node={2}" -f $p,$py,$nd)
}
Write-EnvBanner

$chrome = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
$edge = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

function Test-ServerAlive([string]$Url) {
  if (-not $Url) { return $false }
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) { return $true }
  } catch { }
  return $false
}

function Start-CrmBrowser {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [switch]$Wait
  )

  $args = "--new-window `"$Url`""
  try {
    $proc = $null
    if ($chrome)      { $proc = Start-Process -FilePath $chrome -ArgumentList $args -PassThru }
    elseif ($edge)    { $proc = Start-Process -FilePath $edge   -ArgumentList $args -PassThru }
    else              { $proc = Start-Process -FilePath $Url    -PassThru }
  } catch {
    Write-Host "[WARN] Failed to launch browser directly; falling back to default URL open."
    try { Start-Process -FilePath $Url | Out-Null } catch {}
  }
  # IMPORTANT: Do NOT Wait-Process on the browser here in non-DEBUG. Let the script exit after server readiness.

  if ($Wait -and $proc -and $proc.Id) {
    try { Wait-Process -Id $proc.Id } catch {}
  }
  return $proc
}

function Try-ReuseExistingServer {
  if (-not (Test-Path $StateFile)) { return $false }

  $state = $null
  try {
    $raw = Get-Content -Path $StateFile -Raw -ErrorAction Stop
    if ($raw) { $state = $raw | ConvertFrom-Json }
  } catch {
    Write-Log "[WARN] Unable to read existing server state. Removing stale file."
    try { Remove-Item -Path $StateFile -Force -ErrorAction SilentlyContinue } catch {}
    return $false
  }

  if (-not $state -or -not $state.Url) {
    try { Remove-Item -Path $StateFile -Force -ErrorAction SilentlyContinue } catch {}
    return $false
  }

  $targetUrl = [string]$state.Url
  if (Test-ServerAlive -Url $targetUrl) {
    Write-Log "[INFO] Existing CRM server detected at $targetUrl"
    Start-CrmBrowser -Url $targetUrl
    Write-Log "[EXIT] Reused running server."
    exit 0
  }

  Write-Log "[INFO] Removing stale server state at $StateFile"
  try { Remove-Item -Path $StateFile -Force -ErrorAction SilentlyContinue } catch {}
  return $false
}

Try-ReuseExistingServer | Out-Null

# ---------- ExecutionPolicy (process scope only; NEVER relaunch) ----------
try {
  $cur = Get-ExecutionPolicy -Scope Process -ErrorAction SilentlyContinue
  if ($cur -ne 'Bypass' -and $cur -ne 'Unrestricted') {
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction Stop
    Write-Log "[INFO] ExecutionPolicy(Process)=Bypass"
  } else {
    Write-Log "[INFO] ExecutionPolicy(Process)=$cur"
  }
} catch { Write-Log "[WARN] Unable to set ExecutionPolicy(Process): $($_.Exception.Message)" }
Write-Log "[INFO] No relaunch; continuing in current process."

# ---------- Web-root autodetect (rename-safe) ----------
function Resolve-WebRoot([string]$Hint) {
  if ($Hint -and (Test-Path $Hint)) { return (Resolve-Path $Hint).Path }
  if ($env:CRM_WEBROOT -and (Test-Path $env:CRM_WEBROOT)) { return (Resolve-Path $env:CRM_WEBROOT).Path }

  $repo = (Split-Path $PSScriptRoot -Parent)
  $candidates = @()

  # Prefer a folder named 'crm-app'
  $crmApp = Join-Path $repo 'crm-app'
  if (Test-Path $crmApp) { $candidates += (Get-Item $crmApp) }

  # Direct children that look like the app
  $children = Get-ChildItem $repo -Directory -ErrorAction SilentlyContinue
  foreach ($d in $children) {
    $hasIndex = Test-Path (Join-Path $d.FullName 'index.html')
    $hasLoader = (Test-Path (Join-Path $d.FullName 'js\patches\loader.js')) -or (Test-Path (Join-Path $d.FullName 'js\boot\loader.js'))
    if ($hasIndex -and $hasLoader) { $candidates += $d }
  }

  # Fallback: any folder containing index.html (deep)
  if (-not $candidates) {
    $deep = Get-ChildItem $repo -Directory -Recurse -ErrorAction SilentlyContinue
    foreach ($d in $deep) {
      if (Test-Path (Join-Path $d.FullName 'index.html')) { $candidates += $d }
    }
  }

  if ($candidates -and $candidates.Count -gt 0) {
    $loaders = @('js/patches/loader.js', 'js/boot/loader.js')
    $sorted = $candidates | Sort-Object LastWriteTime -Descending
    foreach ($pick in $sorted) {
      $probeTargets = @($pick.FullName)
      $nested = Join-Path $pick.FullName 'crm-app'
      if (Test-Path $nested) { $probeTargets += $nested }

      foreach ($target in $probeTargets) {
        $index = Join-Path $target 'index.html'
        if (-not (Test-Path $index)) { continue }

        $hasLoader = $false
        foreach ($rel in $loaders) {
          if (Test-Path (Join-Path $target $rel)) { $hasLoader = $true; break }
        }

        $cssPath = Join-Path $target 'css/app.css'
        if ($hasLoader -or (Test-Path $cssPath)) {
          $resolved = (Resolve-Path $target).Path
          # Soft CSS sanity (warn only)
          try {
            $idx = Join-Path $resolved 'index.html'
            $html = [System.IO.File]::ReadAllText($idx)
            $hrefs = [regex]::Matches($html, '<link[^>]+rel=["'']stylesheet["''][^>]+href=["'']([^"'']+)["'']', 'IgnoreCase') | ForEach-Object { $_.Groups[1].Value }
            $foundCss = $false
            foreach($h in $hrefs){ if ($h -notmatch '^https?://') { $p = Join-Path $resolved $h; if (Test-Path $p) { $foundCss = $true; break } } }
            if (-not $foundCss) {
              $anyCss = Get-ChildItem -Path $resolved -Filter *.css -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
              if (-not $anyCss) { Write-Warning "[START] No local CSS files detected under $resolved. The app may appear unstyled if CDN/style paths are wrong." }
            }
          } catch { Write-Verbose "[START] CSS heuristic skipped: $($_.Exception.Message)" }
          return $resolved
        }
      }
    }
  }

  throw "Web root not found under $repo. Pass -WebRoot '.\crm-app' or set CRM_WEBROOT."
}

try {
  $ResolvedWebRoot = Resolve-WebRoot -Hint $WebRoot
  Write-Log "[INFO] WEBROOT: $ResolvedWebRoot"
  $WEBROOT = $ResolvedWebRoot
} catch {
  $global:LAUNCH_FAILED = $true
  Write-Log "[ERROR] $($_.Exception.Message)"
  Write-Host "Could not locate the app folder (web root)." -ForegroundColor Red
  Write-Host "Fix options:" -ForegroundColor Yellow
  Write-Host "  1) Rename your tool folder to 'crm-app' (recommended) OR"
  Write-Host "  2) Run:  .\tools\Start-CRM.ps1 -WebRoot '.\path\to\app'"
  Write-Host "Log: $LogPath"
  Write-Host "Press Enter to close..."
  [void][Console]::ReadLine()
  exit 1
}

$DEBUG = ($env:CRM_DEBUG -eq "1") -or ($PSBoundParameters.ContainsKey('Verbose')) -or ($VerbosePreference -eq 'Continue')

# ===================== BEGIN REPLACEMENT BLOCK =====================
# Resolve WEBROOT (already computed earlier)
$WebRoot = $WEBROOT
if (-not (Test-Path -LiteralPath $WebRoot)) {
  Write-Log "[ERROR] WEBROOT not found: $WebRoot"
  exit 2
}

# Ensure logs folder
$LogDir = if ($env:LocalAppData) { Join-Path $env:LocalAppData "CRM\logs" } else { $LogRoot }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Pick an open port in 8080–8090
function Get-OpenPort {
  param([int]$Start=8080,[int]$End=8090)
  for ($p=$Start; $p -le $End; $p++) {
    try {
      $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
      $listener.Start()
      $listener.Stop()
      return $p
    } catch {
      # in use, skip
    }
  }
  return $null
}
$Port = Get-OpenPort
if (-not $Port) { Write-Log "[ERROR] No open port in 8080-8090"; exit 3 }

$Url = "http://127.0.0.1:$Port/"

# Build server start candidates (prefer py launcher)
$candidates = @()
if (Get-Command py.exe -ErrorAction SilentlyContinue) {
  # Python 3.7+ supports --directory; also bind explicitly
  $candidates += @{
    File = "py.exe";
    Args = "-3 -m http.server $Port --bind 127.0.0.1 --directory `"$WebRoot`""
  }
  # Fallback: older py, cd into root and run without --directory
  $candidates += @{
    File = "py.exe";
    Args = "-m http.server $Port --bind 127.0.0.1"
    WorkDir = $WebRoot
  }
}
if (Get-Command python.exe -ErrorAction SilentlyContinue) {
  $candidates += @{
    File = "python.exe";
    Args = "-m http.server $Port --bind 127.0.0.1 --directory `"$WebRoot`""
  }
  $candidates += @{
    File = "python.exe";
    Args = "-m http.server $Port --bind 127.0.0.1";
    WorkDir = $WebRoot
  }
}

if ($candidates.Count -eq 0) {
  Write-Log "[ERROR] Neither py.exe nor python.exe found in PATH."
  exit 4
}

# Start server with logging and readiness probe
$ServerProc = $null
$SrvOut = Join-Path $LogDir ("server-out-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
$SrvErr = Join-Path $LogDir ("server-err-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))

function Start-StaticServer {
  param($spec)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $spec.File
  $psi.Arguments = $spec.Args
  $psi.WorkingDirectory = $(if ($spec.WorkDir) { $spec.WorkDir } else { $WebRoot })
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $proc = New-Object System.Diagnostics.Process
  $proc.StartInfo = $psi

  # Open output streams
  $stdout = [System.IO.StreamWriter]::new($SrvOut, $true)
  $stderr = [System.IO.StreamWriter]::new($SrvErr, $true)

  $null = $proc.Start()
  $proc.add_OutputDataReceived({ param($s,$e) if ($e.Data) { $stdout.WriteLine($e.Data) ; $stdout.Flush() } })
  $proc.add_ErrorDataReceived({ param($s,$e) if ($e.Data) { $stderr.WriteLine($e.Data) ; $stderr.Flush() } })
  $proc.BeginOutputReadLine()
  $proc.BeginErrorReadLine()

  return @{ Proc = $proc; Out = $stdout; Err = $stderr }
}

function Stop-StaticServer {
  param($ctx)
  if ($ctx -and $ctx.Proc -and -not $ctx.Proc.HasExited) { try { $ctx.Proc.Kill() } catch {} }
  foreach ($w in @($ctx.Out, $ctx.Err)) { try { if ($w) { $w.Dispose() } } catch {} }
}

function Wait-ServerReady {
  param([string]$checkUrl, [int]$timeoutSec = 20)
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $checkUrl -Method Head -UseBasicParsing -TimeoutSec 2
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) { return $true }
    } catch {}
    Start-Sleep -Milliseconds 300
  }
  return $false
}

$started = $false
$ServerCtx = $null
foreach ($spec in $candidates) {
  $workDirLog = if ($spec.ContainsKey('WorkDir') -and $spec.WorkDir) { $spec.WorkDir } else { $WebRoot }
  Write-Log "[INFO] Attempt server: $($spec.File) $($spec.Args) (wd=$workDirLog)"
  $ctx = Start-StaticServer -spec $spec
  $ServerProc = $ctx.Proc

  # Early exit detection
  Start-Sleep -Milliseconds 300
  if ($ServerProc.HasExited) {
    Write-Log "[WARN] Server exited immediately. Code=$($ServerProc.ExitCode)"
    Stop-StaticServer -ctx $ctx
    continue
  }

  if (Wait-ServerReady -checkUrl $Url -timeoutSec 25) {
    Write-Log "[INFO] Server ready at $Url"
    $ServerCtx = $ctx
    $Global:__ServerCtx = $ctx
    $started = $true
    break
  } else {
    Write-Log "[ERROR] Server failed readiness at $Url. Killing and trying next candidate."
    Stop-StaticServer -ctx $ctx
  }
}

if (-not $started) {
  Write-Log "[ERROR] All server attempts failed."
  Write-Log "[HINT] Check logs: $SrvOut and $SrvErr"
  exit 5
}

try {
  $state = @{ Url = $Url; Pid = if ($ServerProc) { $ServerProc.Id } else { $null }; Started = (Get-Date).ToString('o') }
  $state | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8
} catch {
  Write-Log "[WARN] Unable to write state file: $($_.Exception.Message)"
}

$args = "--new-window `"$Url`""

# Launch browser (non-blocking in non-DEBUG)
# Existing logic should have detected Chrome/Edge; reuse your variables: $chrome, $edge, $args, $DEBUG, $KeepOpen
try {
  $proc = $null
  if ($chrome)      { $proc = Start-Process -FilePath $chrome -ArgumentList $args -PassThru }
  elseif ($edge)    { $proc = Start-Process -FilePath $edge   -ArgumentList $args -PassThru }
  else              { $proc = Start-Process -FilePath $Url    -PassThru }
  Write-Log "[INFO] Launched browser. PID=$($proc.Id)"
} catch {
  Write-Log "[WARN] Failed to launch browser directly; falling back to default URL open."
  try { Start-Process -FilePath $Url | Out-Null } catch {}
}

# In non-DEBUG/!KeepOpen mode, exit immediately so the console closes
if (-not $DEBUG -and -not $KeepOpen) {
  Write-Log "[EXIT] success."
  exit 0
}

# DEBUG/diagnostic: keep window open; show tail of server logs
Write-Log "[INFO] DEBUG/KeepOpen active. Tailing server logs (Ctrl+C to quit)."
Write-Log "[INFO] STDOUT: $SrvOut"
Write-Log "[INFO] STDERR: $SrvErr"
try {
  Get-Content -Path $SrvOut -Wait -ErrorAction SilentlyContinue | ForEach-Object { $_ }
} catch {}
# ===================== END REPLACEMENT BLOCK =====================
