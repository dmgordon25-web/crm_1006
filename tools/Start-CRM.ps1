#requires -version 5.1
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$script:Listener = $null
$script:Mutex = $null
$script:ServerPowerShell = $null
$script:ServerRunspace = $null
$script:ServerAsync = $null
$script:StdOut = $null
$script:StdErr = $null

function Write-LogLine {
  param(
    [string]$Path,
    [string]$Line
  )
  if([string]::IsNullOrWhiteSpace($Path) -or [string]::IsNullOrWhiteSpace($Line)){ return }
  try {
    [System.IO.File]::AppendAllText($Path, $Line + [Environment]::NewLine)
  } catch {
    # Ignore logging failures to avoid breaking launcher
  }
}

function Say {
  param(
    [string]$Message,
    [string]$Level = 'INFO'
  )
  $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $line = "$timestamp [$Level] $Message"
  $color = 'Gray'
  switch ($Level) {
    'WARN' { $color = 'Yellow' }
    'ERROR' { $color = 'Red' }
    'OK' { $color = 'Green' }
  }
  Write-Host $line -ForegroundColor $color
  if($script:StdOut){ Write-LogLine -Path $script:StdOut -Line $line }
  if($Level -eq 'ERROR' -and $script:StdErr){ Write-LogLine -Path $script:StdErr -Line $line }
}

function Cleanup {
  if($script:Listener){
    try { $script:Listener.Stop() } catch {}
    try { $script:Listener.Close() } catch {}
    $script:Listener = $null
  }
  if($script:ServerPowerShell){
    if($script:ServerAsync){
      try { $script:ServerPowerShell.EndInvoke($script:ServerAsync) } catch {}
    }
    try { $script:ServerPowerShell.Stop() } catch {}
    try { $script:ServerPowerShell.Dispose() } catch {}
    $script:ServerPowerShell = $null
    $script:ServerAsync = $null
  }
  if($script:ServerRunspace){
    try { $script:ServerRunspace.Close() } catch {}
    try { $script:ServerRunspace.Dispose() } catch {}
    $script:ServerRunspace = $null
  }
  if($script:Mutex){
    try { $script:Mutex.ReleaseMutex() } catch {}
    try { $script:Mutex.Dispose() } catch {}
    $script:Mutex = $null
  }
  try { Stop-Transcript | Out-Null } catch {}
}

function Fail {
  param(
    [int]$Code,
    [string]$Reason,
    [string]$Resolution
  )
  $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  Say "CODE $Code — $Reason" 'ERROR'
  if($Resolution -and $script:StdErr){ Write-LogLine -Path $script:StdErr -Line "$timestamp [RESOLUTION] $Resolution" }
  if($Resolution){
    Write-Host 'Resolution:' -ForegroundColor Yellow
    Write-Host $Resolution -ForegroundColor Yellow
  }
  Cleanup
  Read-Host "`nPress Enter to exit"
  exit $Code
}

function Is-Admin {
  try {
    return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
  } catch {
    return $false
  }
}

# ---------------- paths & logs ----------------
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$WebRoot  = (Resolve-Path -LiteralPath (Join-Path $RepoRoot 'crm-app')).Path
$Index    = Join-Path $WebRoot 'index.html'
$JsRoot   = Join-Path $WebRoot 'js'

$LogsDir = Join-Path $env:LOCALAPPDATA 'CRM\logs'
New-Item -ItemType Directory -Force -Path $LogsDir | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$RunLog = Join-Path $LogsDir "launcher_${Stamp}.run.log"
$StdOut = Join-Path $LogsDir "launcher_${Stamp}.out.log"
$StdErr = Join-Path $LogsDir "launcher_${Stamp}.err.log"
$script:StdOut = $StdOut
$script:StdErr = $StdErr

New-Item -ItemType File -Force -Path $StdOut | Out-Null
New-Item -ItemType File -Force -Path $StdErr | Out-Null
try { Start-Transcript -Path $RunLog -Append -ErrorAction SilentlyContinue | Out-Null } catch {}

Say "Repo: $RepoRoot"
Say "Web : $WebRoot"
Say "Run : $RunLog"
Say "Out : $StdOut"
Say "Err : $StdErr"

# --------------- single-instance guard ---------------
$mutexName = 'Global\CRM_vFinal_Launcher_Singleton'
try {
  $created = $false
  $script:Mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$created)
  if(-not $created){
    Fail 60 'Another CRM launcher/server seems to be running.' 'Close the other CRM window/server or wait a few seconds, then try again.'
  }
} catch {
  Fail 61 "Unable to create mutex: $($_.Exception.Message)" 'Restart Windows and retry. If the issue persists, check permissions for the Global object namespace.'
}

# --------------- preflight checks ---------------
if(-not (Test-Path -LiteralPath $WebRoot)){
  Fail 10 'Missing folder: crm-app' "Restore the repo so 'crm-app\\' exists."
}
if(-not (Test-Path -LiteralPath $Index)){
  Fail 10 'Missing file: crm-app\index.html' 'Restore index.html to crm-app.'
}
try {
  $len = (Get-Item -LiteralPath $Index).Length
  if($len -lt 50){
    Fail 10 "index.html looks empty ($len bytes)" 'Replace with a valid index.html (several KB expected).'
  }
} catch {
  Fail 10 "Cannot read index.html: $($_.Exception.Message)" 'Fix file permissions or path and retry.'
}

$Loader   = Join-Path $JsRoot 'boot\loader.js'
$Manifest = Join-Path $JsRoot 'boot\manifest.js'
if(-not (Test-Path -LiteralPath $Loader)){
  Fail 11 'Missing js\boot\loader.js' 'Restore js/boot/loader.js (SafeBoot requires it).'
}
if(-not (Test-Path -LiteralPath $Manifest)){
  Fail 11 'Missing js\boot\manifest.js' 'Restore js/boot/manifest.js with CORE/PATCHES arrays.'
}

# --------------- auto-remediation tasks ---------------
try {
  Say 'Unblocking files under crm-app (if needed)…'
  Get-ChildItem -LiteralPath $WebRoot -Recurse -File | ForEach-Object {
    try { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue } catch {}
  }
} catch {
  Say "Unblock step encountered an error: $($_.Exception.Message)" 'WARN'
}

# --------------- pick free port ---------------
$chosenPort = $null
$portRanges = @(8080..8099, 8100..8199)
foreach($range in $portRanges){
  foreach($p in $range){
    $tcp = $null
    try {
      $tcp = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $p)
      $tcp.Start()
      $chosenPort = $p
      break
    } catch {
      continue
    } finally {
      if($tcp){ try { $tcp.Stop() } catch {} }
    }
  }
  if($chosenPort){ break }
}
if(-not $chosenPort){
  Fail 30 'No free port in 8080–8199.' 'Close apps using those ports or adjust the range inside tools/Start-CRM.ps1.'
}

# --------------- HttpListener setup with URL ACL handling ---------------
try { Add-Type -AssemblyName System.Net.HttpListener | Out-Null } catch {}
try { Add-Type -AssemblyName System.Web | Out-Null } catch {}

$prefixes = @(
  "http://127.0.0.1:$chosenPort/",
  "http://localhost:$chosenPort/",
  "http://+:$chosenPort/"
)
$listener = [System.Net.HttpListener]::new()
$script:Listener = $listener
$selectedPrefix = $null
$lastErr = $null

function Test-Prefix {
  param(
    [System.Net.HttpListener]$Listener,
    [string]$Prefix
  )
  try {
    $Listener.Prefixes.Clear()
    $null = $Listener.Prefixes.Add($Prefix)
    $Listener.Start()
    $Listener.Stop()
    return $true
  } catch {
    $global:__lastListenerError = $_
    return $false
  }
}

foreach($prefix in $prefixes){
  if(Test-Prefix -Listener $listener -Prefix $prefix){
    $selectedPrefix = $prefix
    break
  }
  $lastErr = $global:__lastListenerError
  if($lastErr -and ($lastErr.Exception.Message -match 'Access is denied' -or $lastErr.Exception.Message -match 'denied')){
    if(Is-Admin){
      try {
        & netsh http add urlacl url=$prefix user="$env:UserDomain\$env:UserName" listen=yes | Out-Null
        if(Test-Prefix -Listener $listener -Prefix $prefix){
          $selectedPrefix = $prefix
          break
        }
      } catch {
        $lastErr = $_
      }
    } else {
      Say 'URLACL required. Elevating to grant permission for this port…' 'WARN'
      $aclCommand = "& { netsh http add urlacl url='" + $prefix + "' user='" + $env:UserDomain + "\\" + $env:UserName + "' listen=yes }"
      try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-Command', $aclCommand) -Wait
        if(Test-Prefix -Listener $listener -Prefix $prefix){
          $selectedPrefix = $prefix
          break
        }
      } catch {
        $lastErr = $_
      }
    }
  }
}

if(-not $selectedPrefix){
  $message = if($lastErr){ $lastErr.Exception.Message } else { 'Unknown binding failure' }
  Fail 40 "HttpListener could not bind to any prefix for port $chosenPort. $message" 'If prompted, accept the UAC dialog. Otherwise run once as admin, or let the script add URLACL automatically. Corporate AV may block loopback; allow PowerShell loopback.'
}

$listener.Prefixes.Clear()
$null = $listener.Prefixes.Add($selectedPrefix)
try {
  $listener.Start()
} catch {
  Fail 40 "Failed to start server: $($_.Exception.Message)" 'Temporarily disable AV loopback blocking or run once as admin to add URLACL, then retry.'
}

# --------------- MIME map ---------------
$Mime = @{
  '.html'='text/html'; '.htm'='text/html'; '.css'='text/css'; '.js'='application/javascript';
  '.mjs'='application/javascript'; '.map'='application/json'; '.json'='application/json';
  '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg';
  '.gif'='image/gif'; '.ico'='image/x-icon'; '.webmanifest'='application/manifest+json';
  '.txt'='text/plain'; '.csv'='text/csv'; '.wasm'='application/wasm';
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf';
  '.mp4'='video/mp4'; '.webm'='video/webm'
}

# --------------- start server loop on background runspace ---------------
$serverScript = @'
param(
  [System.Net.HttpListener]$listener,
  [string]$webRoot,
  [hashtable]$mimeMap,
  [string]$stdoutLog,
  [string]$stderrLog
)

function Write-ServerLog {
  param(
    [string]$Path,
    [string]$Line
  )
  if([string]::IsNullOrWhiteSpace($Path) -or [string]::IsNullOrWhiteSpace($Line)){ return }
  try {
    [System.IO.File]::AppendAllText($Path, $Line + [Environment]::NewLine)
  } catch {}
}

function Get-MimeType {
  param(
    [string]$FilePath,
    [hashtable]$Map
  )
  $ext = [System.IO.Path]::GetExtension($FilePath)
  if($ext){ $ext = $ext.ToLowerInvariant() }
  if($ext -and $Map.ContainsKey($ext)){ return $Map[$ext] }
  return 'application/octet-stream'
}

while($listener.IsListening){
  $context = $null
  try {
    $context = $listener.GetContext()
    $rawPath = $context.Request.Url.AbsolutePath
    $decoded = [Uri]::UnescapeDataString($rawPath).TrimStart('/')
    if([string]::IsNullOrWhiteSpace($decoded)){ $decoded = 'index.html' }
    if($decoded.EndsWith('/')){ $decoded = $decoded + 'index.html' }
    $candidate = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($webRoot, $decoded))
    $rootFull = [System.IO.Path]::GetFullPath($webRoot)
    $servingPath = $null
    if($candidate.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.File]::Exists($candidate)){
      $servingPath = $candidate
    } else {
      $altDir = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($webRoot, $decoded))
      if($altDir.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Directory]::Exists($altDir)){
        $possible = [System.IO.Path]::Combine($altDir, 'index.html')
        $possibleFull = [System.IO.Path]::GetFullPath($possible)
        if($possibleFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.File]::Exists($possibleFull)){
          $servingPath = $possibleFull
        }
      }
    }

    if($servingPath){
      $bytes = [System.IO.File]::ReadAllBytes($servingPath)
      $context.Response.StatusCode = 200
      $context.Response.ContentType = Get-MimeType -FilePath $servingPath -Map $mimeMap
      $context.Response.Headers['Cache-Control'] = 'no-cache'
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $context.Response.StatusCode = 404
    }
  } catch [System.Net.HttpListenerException] {
    break
  } catch {
    $errorLine = "{0:u} [SERVER] {1}" -f [DateTime]::UtcNow, $_.Exception.Message
    Write-ServerLog -Path $stderrLog -Line $errorLine
    if($context -and $context.Response){
      try { $context.Response.StatusCode = 500 } catch {}
    }
  } finally {
    if($context){
      try { $context.Response.OutputStream.Close() } catch {}
      try { $context.Response.Close() } catch {}
    }
  }
}
'@

$serverRunspace = [runspacefactory]::CreateRunspace()
$serverRunspace.ApartmentState = 'MTA'
$serverRunspace.Open()
$script:ServerRunspace = $serverRunspace
$psInstance = [PowerShell]::Create()
$psInstance.Runspace = $serverRunspace
$null = $psInstance.AddScript($serverScript)
$null = $psInstance.AddArgument($listener)
$null = $psInstance.AddArgument($WebRoot)
$null = $psInstance.AddArgument($Mime)
$null = $psInstance.AddArgument($StdOut)
$null = $psInstance.AddArgument($StdErr)
$script:ServerPowerShell = $psInstance
$script:ServerAsync = $psInstance.BeginInvoke()

$LaunchPrefix = $selectedPrefix
if($LaunchPrefix.StartsWith('http://+:')){
  $LaunchPrefix = "http://127.0.0.1:$chosenPort/"
}
$BaseUrl  = $LaunchPrefix
$IndexUrl = "${BaseUrl}index.html?cb=" + ([Guid]::NewGuid().ToString('N'))

if(-not (Test-Path -LiteralPath $Index)){
  Fail 10 'index.html vanished before launch.' 'Re-extract crm-app and retry.'
}

# --------------- readiness probe ---------------
$ready = $false
for($i = 0; $i -lt 20; $i++){
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $IndexUrl -TimeoutSec 2
    if($resp.StatusCode -eq 200 -and ($resp.Content -match '<html' -or $resp.RawContentLength -gt 800)){
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 250
  }
}
if(-not $ready){
  Say 'Server started, but readiness check timed out. Opening anyway…' 'WARN'
}

# --------------- launch browser ---------------
$opened = $false
$browserPaths = @(
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
)
foreach($browser in $browserPaths){
  if(-not $opened -and -not [string]::IsNullOrEmpty($browser) -and (Test-Path -LiteralPath $browser)){
    try {
      Start-Process -FilePath $browser -ArgumentList @('--new-window', $IndexUrl) | Out-Null
      $opened = $true
    } catch {}
  }
}
if(-not $opened){
  try {
    Start-Process $IndexUrl | Out-Null
    $opened = $true
  } catch {}
}
if(-not $opened){
  $fileUrl = (Get-Item -LiteralPath $Index).FullName
  Say 'Browser HTTP launch failed; opening file:// fallback (feature-limited).' 'WARN'
  try {
    Start-Process $fileUrl | Out-Null
    $opened = $true
  } catch {}
  if(-not $opened){
    Fail 50 'Could not open a browser automatically.' "Copy and paste into a browser: $IndexUrl   (or)   $fileUrl"
  }
}

Say "Server up at $BaseUrl" 'OK'
Say "Browser launched → $IndexUrl" 'OK'
Write-Host ''
Say 'Press Ctrl+C to stop the server when you are finished.' 'INFO'

try {
  while($true){ Start-Sleep -Seconds 1 }
} finally {
  Cleanup
}

exit 0
