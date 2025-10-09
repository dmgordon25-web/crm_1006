#requires -version 5.1
$ErrorActionPreference = 'Stop'

function Say([string]$msg,[string]$lvl='INFO'){
  $ts=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $fg='Gray'; if($lvl -eq 'WARN'){$fg='Yellow'} elseif($lvl -eq 'ERROR'){$fg='Red'} elseif($lvl -eq 'OK'){$fg='Green'}
  Write-Host "$ts [$lvl] $msg" -ForegroundColor $fg
}
function PauseExit([int]$code){ [void](Read-Host 'Press Enter to exit'); exit $code }
function Fail([string]$reason,[int]$code=1){ Say $reason 'ERROR'; PauseExit $code }
function IsAdmin(){ try{ ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator) }catch{ $false } }

# Resolve paths
$RepoRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$WebRoot =(Resolve-Path -LiteralPath (Join-Path $RepoRoot 'crm-app')).Path
$Index   =Join-Path $WebRoot 'index.html'
$JsRoot  =Join-Path $WebRoot 'js'
Say "Repo: $RepoRoot"
Say "Web : $WebRoot"

# Preflight (repo integrity)
if(-not (Test-Path -LiteralPath $WebRoot)){ Fail "Missing folder: crm-app" 10 }
if(-not (Test-Path -LiteralPath $Index)){   Fail "Missing file: crm-app\index.html" 10 }
try{ $len=(Get-Item -LiteralPath $Index).Length; if($len -lt 50){ Fail "index.html looks empty ($len bytes)" 10 } }catch{ Fail ("Cannot read index.html: " + $_.Exception.Message) 10 }
if(-not (Test-Path -LiteralPath (Join-Path $JsRoot 'boot\loader.js'))){   Fail "Missing js\boot\loader.js" 11 }
if(-not (Test-Path -LiteralPath (Join-Path $JsRoot 'boot\manifest.js'))){ Fail "Missing js\boot\manifest.js" 11 }

# Non-admin friendly unblocking (no error if unnecessary)
try{ Get-ChildItem -LiteralPath $WebRoot -Recurse -File | ForEach-Object { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue } }catch{}

# Decide path: HttpListener or file:// fallback
$haveHttpListener = [type]::GetType('System.Net.HttpListener') -ne $null
if(-not $haveHttpListener){
  Say "HttpListener type not available on this box; opening file:// fallback" 'WARN'
  $fileUrl=(Get-Item -LiteralPath $Index).FullName
  try{ Start-Process $fileUrl | Out-Null }catch{}
  PauseExit 0
}

# HttpListener path (no Add-Type)
# Pick free port
$Port=$null
foreach($range in @((8080..8099),(8100..8199))){
  foreach($p in $range){
    try{ $tcp=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$p); $tcp.Start(); $tcp.Stop(); $Port=$p; break }catch{}
  }
  if($Port){ break }
}
if(-not $Port){ Fail "No free port in 8080..8199" 30 }

# Try to start listener; if denied, auto-add URLACL once
$prefix="http://127.0.0.1:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
try{
  $listener.Start()
}catch{
  $msg=$_.Exception.Message
  if(($msg -match 'denied') -or ($msg -match 'Access is denied')){
    if(-not (IsAdmin)){
      Say "Permission needed to reserve URL. Requesting UAC once..." 'WARN'
      $acl="netsh http add urlacl url=$prefix user=$env:UserDomain\$env:UserName listen=yes"
      try{ Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList "-NoProfile","-Command",$acl -Wait }catch{ Fail ("URL ACL add failed: " + $_.Exception.Message) 40 }
      try{ $listener.Start() }catch{ Fail ("Could not start server after URL ACL: " + $_.Exception.Message) 40 }
    } else {
      & netsh http add urlacl url=$prefix user="$env:UserDomain\$env:UserName" listen=yes | Out-Null
      try{ $listener.Start() }catch{ Fail ("Could not start server after URL ACL: " + $_.Exception.Message) 40 }
    }
  } else {
    Fail ("Could not start server: " + $msg) 40
  }
}

# MIME map (common types)
$Mime=@{
  '.html'='text/html'; '.htm'='text/html'; '.css'='text/css'; '.js'='application/javascript'
  '.mjs'='application/javascript'; '.map'='application/json'; '.json'='application/json'
  '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'
  '.gif'='image/gif'; '.ico'='image/x-icon'; '.webmanifest'='application/manifest+json'
  '.txt'='text/plain'; '.csv'='text/csv'; '.wasm'='application/wasm'
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf'
}
function Get-Mime([string]$p){ $e=[IO.Path]::GetExtension($p).ToLower(); if($Mime.ContainsKey($e)){ $Mime[$e] } else { 'application/octet-stream' } }

# Launch browser
$IndexUrl = "http://127.0.0.1:$Port/index.html?cb=" + ([Guid]::NewGuid().ToString('N'))
$opened=$false
foreach($b in @(
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
)){
  if(-not $opened -and (Test-Path -LiteralPath $b)){
    try{ Start-Process -FilePath $b -ArgumentList @('--new-window',$IndexUrl) | Out-Null; $opened=$true }catch{}
  }
}
if(-not $opened){ try{ Start-Process $IndexUrl | Out-Null; $opened=$true }catch{} }
if(-not $opened){ $file=(Get-Item -LiteralPath $Index).FullName; Say "HTTP open failed; trying file:// fallback" 'WARN'; try{ Start-Process $file | Out-Null; $opened=$true }catch{}; if(-not $opened){ Fail ("Unable to open a browser. Open manually: " + $IndexUrl) 50 } }

Say ("Server up: " + "http://127.0.0.1:$Port/") 'OK'
Say ("Opening: " + $IndexUrl) 'OK'
Write-Host ""

# Simple serve loop (Ctrl+C to stop)
while($true){
  try{
    $ctx=$listener.GetContext()
    $raw=$ctx.Request.Url.AbsolutePath
    $path=[System.Uri]::UnescapeDataString($raw).TrimStart('/')
    if([string]::IsNullOrWhiteSpace($path)){ $path='index.html' }
    if($path.EndsWith('/')){ $path=$path+'index.html' }
    $fs=Join-Path $WebRoot $path
    if(-not (Test-Path -LiteralPath $fs)){
      $alt=Join-Path (Join-Path $WebRoot $path) 'index.html'
      if(Test-Path -LiteralPath $alt){ $fs=$alt }
    }
    if(Test-Path -LiteralPath $fs){
      $bytes=[System.IO.File]::ReadAllBytes($fs)
      $ctx.Response.ContentType=Get-Mime $fs
      $ctx.Response.Headers['Cache-Control']='no-cache'
      $ctx.Response.ContentLength64=$bytes.Length
      $ctx.Response.StatusCode=200
      $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
    } else {
      $ctx.Response.StatusCode=404
    }
  }catch{
    try{ $ctx.Response.StatusCode=500 }catch{}
  }finally{
    try{ $ctx.Response.OutputStream.Close() }catch{}
    try{ $ctx.Response.Close() }catch{}
  }
}
