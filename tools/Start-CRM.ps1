param(
  [switch]$DEBUG = $false,
  [switch]$KeepOpen = $false
)

function Log([string]$msg) {
  $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss\Z")
  Write-Host "$ts  $msg"
}

# Resolve paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Resolve-Path (Join-Path $ScriptDir "..")
$WebRoot   = Resolve-Path (Join-Path $RepoRoot "crm-app")
if (-not (Test-Path -LiteralPath $WebRoot)) { Log "[ERROR] WEBROOT missing: $WebRoot"; exit 2 }

# Logs
$LogDir = Join-Path $env:LocalAppData "CRM\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$SrvOut = Join-Path $LogDir ("server-out-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
$SrvErr = Join-Path $LogDir ("server-err-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))

Log "[BOOT] Start-CRM.ps1 begin"
Log "[INFO] PSVersion=$($PSVersionTable.PSVersion) Arch=$env:PROCESSOR_ARCHITECTURE"
Log "[INFO] WEBROOT: $WebRoot"

# Kill stale python http.server processes
try {
  $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^python(\.exe)?$' -or $_.Name -match '^py(\.exe)?$'
  }
  foreach ($p in $procs) {
    if ($p.CommandLine -match 'http\.server' -or $p.CommandLine -match 'crm-app') {
      Log "[WARN] Killing stale process PID=$($p.ProcessId) Name=$($p.Name)"
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
} catch {}
Start-Sleep -Milliseconds 200

# Pick open port
function Get-OpenPort([int]$Start=8080,[int]$End=8125) {
  for ($port=$Start; $port -le $End; $port++) {
    try {
      $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
      $l.Start(); $l.Stop(); return $port
    } catch {}
  }
  return $null
}
$Port = Get-OpenPort 8080 8125
$UseAutoPort = $false
if (-not $Port) { Log "[WARN] 8080–8125 busy; letting OS assign a free port."; $Port = 0; $UseAutoPort = $true }

# Choose python
$Python = $null
if (Get-Command py.exe -ErrorAction SilentlyContinue) { $Python = "py.exe" } elseif (Get-Command python.exe -ErrorAction SilentlyContinue) { $Python = "python.exe" } else { Log "[ERROR] Python not found in PATH"; exit 4 }

# Build argument list as an ARRAY (no fragile quotes)
if ($Python -eq "py.exe") {
  $SrvArgs = @('-3','-m','http.server',"$Port",'--bind','127.0.0.1','--directory',"$WebRoot")
} else {
  $SrvArgs = @('-m','http.server',"$Port",'--bind','127.0.0.1','--directory',"$WebRoot")
}

Log ("[INFO] Launching server: {0} {1}" -f $Python, ($SrvArgs -join ' '))
$proc = Start-Process -FilePath $Python `
  -ArgumentList $SrvArgs `
  -WorkingDirectory $WebRoot `
  -NoNewWindow:$false `
  -PassThru `
  -RedirectStandardOutput $SrvOut `
  -RedirectStandardError  $SrvErr

if (-not $proc) { Log "[ERROR] Failed to start server process"; exit 5 }

# Determine URL
$Url = "http://127.0.0.1:8080/"
if (-not $UseAutoPort) {
  $Url = "http://127.0.0.1:$Port/"
}

# If OS chose port 0, try to read from stdout or probe
function TryReadPortFromLog {
  try {
    $lines = Get-Content -Path $SrvOut -Tail 50 -ErrorAction SilentlyContinue
    foreach ($ln in $lines) {
      if ($ln -match 'Serving HTTP on 127\.0\.0\.1 port (\d+)') { return [int]$Matches[1] }
      if ($ln -match 'http://127\.0\.0\.1:(\d+)/')             { return [int]$Matches[1] }
    }
  } catch {}
  return $null
}

if ($UseAutoPort) {
  Start-Sleep -Milliseconds 250
  $detected = TryReadPortFromLog
  if ($detected) { $Url = "http://127.0.0.1:$detected/"; Log "[INFO] Detected server port: $detected" }
  else { Log "[WARN] Could not parse port from logs; will probe 8080–8150" }
}

# Readiness probe
function Wait-Ready([string]$baseUrl, [int]$timeoutSec=30) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  $ports = @()
  if ($baseUrl -match ':(\d+)/') { $ports += [int]$Matches[1] }
  $ports += 8080..8150

  while ((Get-Date) -lt $deadline) {
    foreach ($p in $ports) {
      $u = "http://127.0.0.1:$p/"
      try {
        $r = Invoke-WebRequest -Uri $u -Method Head -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $u }
      } catch {}
    }
    Start-Sleep -Milliseconds 250
  }
  return $null
}

$readyUrl = Wait-Ready -baseUrl $Url -timeoutSec 30
if (-not $readyUrl) {
  Log "[ERROR] Server did not become ready."
  Log "[INFO] STDOUT: $SrvOut"
  Log "[INFO] STDERR: $SrvErr"
  exit 6
}
$Url = $readyUrl
Log "[INFO] Server ready at $Url (PID $($proc.Id))"

# Launch browser (simple and PS5-safe)
try { Start-Process $Url | Out-Null; Log "[INFO] Browser launched." } catch { Log "[WARN] Could not auto-open browser. Open $Url manually." }

if (-not $DEBUG -and -not $KeepOpen) { Log "[EXIT] success."; exit 0 }

Log "[INFO] DEBUG mode; tailing server logs. Press Ctrl+C to stop."
try { Get-Content -Path $SrvOut -Wait -ErrorAction SilentlyContinue | ForEach-Object { $_ } } catch {}
