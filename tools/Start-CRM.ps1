param(
  [switch]$DEBUG = $false,
  [switch]$KeepOpen = $false
)

# ---------- helpers ----------
function Write-Log([string]$msg) {
  $ts = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss\Z")
  Write-Host "$ts  $msg"
}

# Resolve paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Resolve-Path (Join-Path $ScriptDir "..");
$WebRoot   = Resolve-Path (Join-Path $RepoRoot "crm-app")
if (-not (Test-Path -LiteralPath $WebRoot)) { Write-Log "[ERROR] WEBROOT missing: $WebRoot"; exit 2 }

# Logs
$LogDir = Join-Path $env:LocalAppData "CRM\logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$SrvOut = Join-Path $LogDir ("server-out-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
$SrvErr = Join-Path $LogDir ("server-err-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))

Write-Log "[BOOT] Start-CRM.ps1 begin"
Write-Log "[INFO] PSVersion=$($PSVersionTable.PSVersion) Arch=$env:PROCESSOR_ARCHITECTURE"
Write-Log "[INFO] WEBROOT: $WebRoot"

# ---------- kill stale servers ----------
Write-Log "[INFO] Scanning for stale python/http.server..."
$stale = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessName -match 'python' -or $_.ProcessName -match 'py'
}
foreach ($p in $stale) {
  try {
    $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)").CommandLine
    if ($cmd -match "http\.server" -or $cmd -match "crm-app") {
      Write-Log "[WARN] Killing stale process PID=$($p.Id) Name=$($p.ProcessName)"
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    }
  } catch {}
}
Start-Sleep -Milliseconds 300

# ---------- pick open port ----------
function Get-OpenPort([int]$Start=8080,[int]$End=8120) {
  for ($port=$Start; $port -le $End; $port++) {
    try {
      $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
      $l.Start(); $l.Stop(); return $port
    } catch {}
  }
  return $null
}
$Port = Get-OpenPort 8080 8120
if (-not $Port) {
  Write-Log "[WARN] 8080–8120 busy; letting OS assign a free port."
  $Port = 0
}
$Url = "http://127.0.0.1:{0}/" -f ($Port -as [string])

# ---------- choose python ----------
$Python = $null
if (Get-Command py.exe -ErrorAction SilentlyContinue) { $Python = "py.exe" }
elseif (Get-Command python.exe -ErrorAction SilentlyContinue) { $Python = "python.exe" }
else { Write-Log "[ERROR] Python not found in PATH"; exit 4 }

# Args: use --directory to avoid cwd issues; if $Port 0, http.server prints chosen port, but we don't rely on parsing—poll below
$SrvArgs = if ($Python -eq "py.exe") { "-3 -m http.server $Port --bind 127.0.0.1 --directory `"$WebRoot`"" } else { "-m http.server $Port --bind 127.0.0.1 --directory `"$WebRoot`"" }

Write-Log "[INFO] Launching server: $Python $SrvArgs"
$proc = Start-Process -FilePath $Python `
  -ArgumentList $SrvArgs `
  -WorkingDirectory $WebRoot `
  -NoNewWindow:$false `
  -PassThru `
  -RedirectStandardOutput $SrvOut `
  -RedirectStandardError  $SrvErr

if (-not $proc) { Write-Log "[ERROR] Failed to start server process"; exit 5 }

# ---------- discover actual port if OS assigned ----------
function TryReadPortFromLog {
  try {
    $lines = Get-Content -Path $SrvOut -Tail 20 -ErrorAction SilentlyContinue
    foreach ($ln in $lines) {
      if ($ln -match 'Serving HTTP on 127\.0\.0\.1 port (\d+)') { return [int]$Matches[1] }
      if ($ln -match 'http://127\.0\.0\.1:(\d+)/')             { return [int]$Matches[1] }
    }
  } catch {}
  return $null
}
if ($Port -eq 0) {
  Start-Sleep -Milliseconds 200
  $detected = TryReadPortFromLog
  if ($detected) { $Port = $detected; $Url = "http://127.0.0.1:$Port/"; Write-Log "[INFO] Detected server port: $Port" }
  else           { $Port = 8080; $Url = "http://127.0.0.1:$Port/"; Write-Log "[WARN] Could not read port; will probe 8080–8125" }
}

# ---------- readiness probe ----------
function Wait-Ready([string]$baseUrl, [int]$timeoutSec=25) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  $tryPorts = @()
  if ($baseUrl -match ':(\d+)/') { $tryPorts += [int]$Matches[1] }
  $tryPorts += 8080..8125

  while ((Get-Date) -lt $deadline) {
    foreach ($p in $tryPorts) {
      $u = "http://127.0.0.1:$p/"
      try {
        $r = Invoke-WebRequest -Uri $u -Method Head -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return @{ Url=$u; Port=$p } }
      } catch {}
    }
    Start-Sleep -Milliseconds 250
  }
  return $null
}

$ready = Wait-Ready -baseUrl $Url -timeoutSec 30
if (-not $ready) {
  Write-Log "[ERROR] Server did not become ready. STDERR/STDOUT:"
  Write-Log "[INFO] STDOUT file: $SrvOut"
  Write-Log "[INFO] STDERR file: $SrvErr"
  exit 6
}
$Url = $ready.Url
Write-Log "[INFO] Server ready at $Url (PID $($proc.Id))"

# ---------- launch browser ----------
try {
  Start-Process $Url | Out-Null
  Write-Log "[INFO] Browser launched."
} catch {
  Write-Log "[WARN] Could not launch browser automatically. Open $Url manually."
}

if (-not $DEBUG -and -not $KeepOpen) {
  Write-Log "[EXIT] success."
  exit 0
}

Write-Log "[INFO] DEBUG mode; tailing server logs. Press Ctrl+C to stop."
try { Get-Content -Path $SrvOut -Wait -ErrorAction SilentlyContinue | ForEach-Object { $_ } } catch {}
