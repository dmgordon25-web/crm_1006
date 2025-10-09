# CRM_vFinal — version-agnostic launcher (PS 5.1 and 7.x)
# - Serves crm-app via HttpListener on http://127.0.0.1:<port>
# - Self-heals URLACL (UAC once) if needed
# - Readiness-check before opening browser; never opens about:blank
# - Fallback to file:// with single WARN line if server cannot start

$ErrorActionPreference = 'Stop'

function Say([string]$msg,[string]$lvl='INFO'){
  $ts=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $fg='Gray'
  switch ($lvl) {
    'WARN' { $fg='Yellow' }
    'ERROR'{ $fg='Red' }
    'OK'   { $fg='Green' }
  }
  Write-Host "$ts [$lvl] $msg" -ForegroundColor $fg
}

function Is-Admin(){
  try {
    $id=[Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch { return $false }
}

function Supports-UseBasicParsing(){
  try { return (Get-Command Invoke-WebRequest -ErrorAction Stop).Parameters.ContainsKey('UseBasicParsing') } catch { return $false }
}

function Http-Head([string]$url){
  try {
    if (Supports-UseBasicParsing) {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $url -Method Get
    } else {
      $r = Invoke-WebRequest -Uri $url -Method Get
    }
    return $r.StatusCode
  } catch {
    return $null
  }
}

function First-FreePort([int]$from=8080,[int]$to=8090){
  foreach($p in $from..$to){
    try {
      $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
      $l.Start(); $l.Stop(); return $p
    } catch {}
  }
  return $null
}

function Test-HttpListener-Usable([string]$prefix){
  try {
    $tmp = New-Object System.Net.HttpListener
    $tmp.Prefixes.Add($prefix)
    $tmp.Start()
    $tmp.Stop()
    return @{ ok=$true; reason=$null }
  } catch {
    $msg = $_.Exception.Message
    if ($msg -match 'Access is denied' -or $msg -match 'ACL') { return @{ ok=$false; reason='ACL' } }
    return @{ ok=$false; reason='OTHER' }
  }
}

function Ensure-UrlAcl([string]$prefix){
  # Add URLACL via netsh (UAC) if not present; return $true on success or already OK
  $test = Test-HttpListener-Usable -prefix $prefix
  if ($test.ok) { return $true }
  if ($test.reason -ne 'ACL') { return $false }

  Say "HttpListener permission missing; attempting one-time URLACL self-fix (UAC prompt expected)" 'WARN'
  if (-not (Is-Admin)) {
    # Relaunch elevated to add ACL then exit
    $cmd = "netsh http add urlacl url=$prefix user=Everyone listen=yes"
    # Use the same host (pwsh/powershell) as caller if possible
    $hostExe = $PSVersionTable.PSEdition -eq 'Core' ? 'pwsh.exe' : 'powershell.exe'
    Start-Process -Verb RunAs -FilePath $hostExe -ArgumentList @('-NoLogo','-NoProfile','-Command', $cmd) | Out-Null
    Start-Sleep -Seconds 2
  } else {
    & netsh http add urlacl url=$prefix user=Everyone listen=yes | Out-Null
  }
  Start-Sleep -Milliseconds 500
  $retest = Test-HttpListener-Usable -prefix $prefix
  return $retest.ok
}

function Get-MimeType([string]$path){
  $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
  switch ($ext) {
    '.html' { 'text/html; charset=utf-8' }
    '.htm'  { 'text/html; charset=utf-8' }
    '.js'   { 'text/javascript; charset=utf-8' }
    '.mjs'  { 'text/javascript; charset=utf-8' }
    '.cjs'  { 'text/javascript; charset=utf-8' }
    '.css'  { 'text/css; charset=utf-8' }
    '.json' { 'application/json; charset=utf-8' }
    '.svg'  { 'image/svg+xml' }
    '.ico'  { 'image/x-icon' }
    '.png'  { 'image/png' }
    '.jpg'  { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    '.map'  { 'application/octet-stream' }
    default { 'application/octet-stream' }
  }
}

function Open-Browser([string]$url){
  $chrome = (Get-Command 'chrome.exe' -ErrorAction SilentlyContinue)?.Source
  $edge   = (Get-Command 'msedge.exe' -ErrorAction SilentlyContinue)?.Source
  if($chrome){ Start-Process -FilePath $chrome -ArgumentList @($url); return }
  if($edge){   Start-Process -FilePath $edge   -ArgumentList @($url); return }
  Start-Process -FilePath $url
}

# Resolve repo paths
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$WebRoot  = (Resolve-Path -LiteralPath (Join-Path $RepoRoot 'crm-app')).Path
$Index    = Join-Path $WebRoot 'index.html'
$JsRoot   = Join-Path $WebRoot 'js'
if(-not (Test-Path -LiteralPath $WebRoot)){ Say 'Missing folder: crm-app' 'ERROR'; exit 10 }
if(-not (Test-Path -LiteralPath $Index)){   Say 'Missing file: crm-app\index.html' 'ERROR'; exit 10 }

# Unblock downloaded files quietly
try { Get-ChildItem -LiteralPath $WebRoot -Recurse -File | ForEach-Object { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue } } catch {}

# Choose port and prefix
$Port = First-FreePort 8080 8090
if(-not $Port){ Say 'No free port in 8080-8090' 'ERROR'; exit 12 }
$Prefix = "http://127.0.0.1:$Port/"
$RunLog = Join-Path $env:TEMP ("crm_vfinal_" + $Port + "_" + [Guid]::NewGuid().ToString("N") + ".log")
Say ("Run log: " + $RunLog)

# Try HttpListener; attempt URLACL self-fix if needed
$listenerUsable = Test-HttpListener-Usable -prefix $Prefix
if(-not $listenerUsable.ok -and $listenerUsable.reason -eq 'ACL'){
  if (Ensure-UrlAcl -prefix $Prefix) {
    $listenerUsable = @{ ok=$true; reason=$null }
  }
}

$HaveHttpListener = $listenerUsable.ok
$ServerJob = $null

if($HaveHttpListener){
  Say ("Server up on " + $Prefix) 'OK'
  $ServerJob = Start-Job -Name ("CRMvFinal-"+$Port) -InitializationScript {
    $ErrorActionPreference = 'Continue'
    function Get-MimeType([string]$path){
      $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
      switch ($ext) {
        '.html' { 'text/html; charset=utf-8' }
        '.htm'  { 'text/html; charset=utf-8' }
        '.js'   { 'text/javascript; charset=utf-8' }
        '.mjs'  { 'text/javascript; charset=utf-8' }
        '.cjs'  { 'text/javascript; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.svg'  { 'image/svg+xml' }
        '.ico'  { 'image/x-icon' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.map'  { 'application/octet-stream' }
        default { 'application/octet-stream' }
      }
    }
  } -ScriptBlock {
    param($prefix,$root,$index,$runlog)
    Add-Content -LiteralPath $runlog -Value ("boot " + (Get-Date).ToString("s") + " " + $prefix)
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
    while($listener.IsListening){
      try {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        $res.Headers['Cache-Control'] = 'no-cache'
        $path = $req.Url.AbsolutePath
        if([string]::IsNullOrWhiteSpace($path) -or $path -eq '/'){ $path = '/index.html' }
        $fsPath = Join-Path $root ($path.TrimStart('/') -replace '/', [IO.Path]::DirectorySeparatorChar)
        if(Test-Path -LiteralPath $fsPath){
          $bytes = [IO.File]::ReadAllBytes($fsPath)
          $res.StatusCode = 200
          $res.ContentType = Get-MimeType $fsPath
          $res.ContentLength64 = $bytes.Length
          $res.OutputStream.Write($bytes,0,$bytes.Length)
        } else {
          $res.StatusCode = 404
        }
      } catch {
        try { $res.StatusCode = 500 } catch {}
      } finally {
        try { $res.OutputStream.Close() } catch {}
        try { $res.Close() } catch {}
      }
    }
  } -ArgumentList $Prefix,$WebRoot,$Index,$RunLog | Out-Null

  # Readiness poll (up to ~4 seconds)
  $ok = $false
  for($i=0; $i -lt 20; $i++){
    $code = Http-Head ($Prefix + 'index.html')
    if($code -eq 200){ $ok = $true; break }
    Start-Sleep -Milliseconds 200
  }
  if($ok){
    Open-Browser ($Prefix + 'index.html?cb=' + [int](Get-Date -UFormat %s))
    Say 'Open in browser: index.html (http)' 'OK'
  } else {
    Say 'Readiness failed; opening file:// fallback' 'WARN'
    Open-Browser $Index
  }
} else {
  Say 'HttpListener unavailable; opening file:// fallback' 'WARN'
  Open-Browser $Index
}

Say 'Press Ctrl+C to stop server (if running). This window can stay open.' 'INFO'
try { while($true){ Start-Sleep -Seconds 3600 } } catch {}
