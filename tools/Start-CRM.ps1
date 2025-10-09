$ErrorActionPreference = 'Stop'

function Say([string]$msg,[string]$lvl='INFO'){
  $ts=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $fg='Gray'; if($lvl -eq 'WARN'){$fg='Yellow'} elseif($lvl -eq 'ERROR'){$fg='Red'} elseif($lvl -eq 'OK'){$fg='Green'}
  Write-Host "$ts [$lvl] $msg" -ForegroundColor $fg
}
function IsAdmin(){ try{ $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }catch{ $false } }
function FirstFreePort([int]$a=8080,[int]$b=8090){ foreach($p in $a..$b){ try{ $l=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,$p); $l.Start(); $l.Stop(); return $p }catch{} } return $null }
function Mime([string]$p){ switch([IO.Path]::GetExtension($p).ToLower()){ '.html'{ 'text/html; charset=utf-8' } '.htm'{ 'text/html; charset=utf-8' } '.js'{ 'text/javascript; charset=utf-8' } '.mjs'{ 'text/javascript; charset=utf-8' } '.css'{ 'text/css; charset=utf-8' } '.json'{ 'application/json; charset=utf-8' } '.svg'{ 'image/svg+xml' } '.ico'{ 'image/x-icon' } '.png'{ 'image/png' } '.jpg'{ 'image/jpeg' } '.jpeg'{ 'image/jpeg' } default{ 'application/octet-stream' } } }

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$WebRoot  = (Resolve-Path (Join-Path $RepoRoot 'crm-app')).Path
$Index    = Join-Path $WebRoot 'index.html'
if(!(Test-Path $Index)){ Say 'Missing crm-app\index.html' 'ERROR'; exit 10 }

# Unblock quietly
try { Get-ChildItem -LiteralPath $WebRoot -Recurse -File | % { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue } } catch {}

$Port   = FirstFreePort 8080 8090
if(!$Port){ Say 'No free port 8080-8090' 'ERROR'; exit 12 }
$Prefix = "http://127.0.0.1:$Port/"
$RunLog = Join-Path $env:TEMP ("crm_vfinal_" + $Port + "_" + [Guid]::NewGuid().ToString("N") + ".log")
Say ("Run log: " + $RunLog)

# Start server job if HttpListener usable (with URLACL fix if needed)
function TryStart-Server([string]$prefix,[string]$root){
  try{
    $test = New-Object Net.HttpListener
    $test.Prefixes.Add($prefix); $test.Start(); $test.Stop()
  }catch{
    $msg=$_.Exception.Message
    if($msg -match 'Access is denied|ACL'){
      Say "URLACL missing; attempting self-fix" 'WARN'
      $cmd = "netsh http add urlacl url=$prefix user=Everyone listen=yes"
      if(!(IsAdmin)){
        $hostExe = ($PSVersionTable.PSEdition -eq 'Core') ? 'pwsh.exe' : 'powershell.exe'
        Start-Process -Verb RunAs -FilePath $hostExe -ArgumentList @('-NoLogo','-NoProfile','-Command', $cmd) | Out-Null
        Start-Sleep -Seconds 2
      } else {
        & netsh http add urlacl url=$prefix user=Everyone listen=yes | Out-Null
      }
    }
    # re-test
    try{ $test = New-Object Net.HttpListener; $test.Prefixes.Add($prefix); $test.Start(); $test.Stop() }catch{ return $null }
  }
  $job = Start-Job -Name ("CRMvFinal-"+$Port) -InitializationScript {
    $ErrorActionPreference='Continue'
    function Mime([string]$p){ switch([IO.Path]::GetExtension($p).ToLower()){ '.html'{ 'text/html; charset=utf-8' } '.htm'{ 'text/html; charset=utf-8' } '.js'{ 'text/javascript; charset=utf-8' } '.mjs'{ 'text/javascript; charset=utf-8' } '.css'{ 'text/css; charset=utf-8' } '.json'{ 'application/json; charset=utf-8' } '.svg'{ 'image/svg+xml' } '.ico'{ 'image/x-icon' } '.png'{ 'image/png' } '.jpg'{ 'image/jpeg' } '.jpeg'{ 'image/jpeg' } default{ 'application/octet-stream' } } }
  } -ScriptBlock {
    param($prefix,$root,$runlog)
    Add-Content -LiteralPath $runlog -Value ("boot " + (Get-Date).ToString("s") + " " + $prefix)
    $l = New-Object Net.HttpListener
    $l.Prefixes.Add($prefix)
    $l.Start()
    while($l.IsListening){
      try{
        $ctx=$l.GetContext(); $req=$ctx.Request; $res=$ctx.Response
        $res.Headers['Cache-Control']='no-cache'
        $path = if([string]::IsNullOrWhiteSpace($req.Url.AbsolutePath) -or $req.Url.AbsolutePath -eq '/'){ '/index.html' } else { $req.Url.AbsolutePath }
        $fs = Join-Path $root ($path.TrimStart('/') -replace '/', [IO.Path]::DirectorySeparatorChar)
        if(Test-Path -LiteralPath $fs){
          $b=[IO.File]::ReadAllBytes($fs)
          $res.StatusCode=200; $res.ContentType=(Mime $fs); $res.ContentLength64=$b.Length
          $res.OutputStream.Write($b,0,$b.Length)
        } else { $res.StatusCode=404 }
      } catch { try{ $res.StatusCode=500 }catch{} }
      finally { try{ $res.OutputStream.Close() }catch{}; try{ $res.Close() }catch{} }
    }
  } -ArgumentList $prefix,$root,$RunLog
  return $job
}

$ServerJob = TryStart-Server -prefix $Prefix -root $WebRoot
$Mode = 'http'
if(!$ServerJob){
  Say "HttpListener unavailable; using file:// fallback" 'WARN'
  $Mode='file'
}

# HEADLESS SMOKE (block until DOM proven or timeout)
$verifyArgs = @()
if($Mode -eq 'http'){ $verifyArgs += @('-Url', ($Prefix + 'index.html')) } else { $verifyArgs += @('-File', $Index) }
$verifyArgs += @('-Selectors', (Join-Path $PSScriptRoot 'smoke_selectors.json'))
$smokeHost = (Get-Command 'pwsh.exe' -ErrorAction SilentlyContinue)?.Source
if(-not $smokeHost){ $smokeHost = (Get-Command 'powershell.exe' -ErrorAction SilentlyContinue)?.Source }
if(-not $smokeHost){ $smokeHost = ($PSVersionTable.PSEdition -eq 'Core') ? 'pwsh' : 'powershell' }
$smokeScript = Join-Path $PSScriptRoot 'smoke.ps1'
& $smokeHost -NoLogo -NoProfile -ExecutionPolicy Bypass -File $smokeScript @verifyArgs | Out-Null
$exit = $LASTEXITCODE

if($exit -ne 0){
  Say "SMOKE FAIL — not opening browser. See log: $RunLog" 'ERROR'
  exit 2
}

# Open normal browser now that DOM verified
$openUrl = ($Mode -eq 'http') ? ($Prefix + 'index.html?cb=' + [int](Get-Date -UFormat %s)) : $Index
$chrome = (Get-Command 'chrome.exe' -ErrorAction SilentlyContinue)?.Source
$edge   = (Get-Command 'msedge.exe' -ErrorAction SilentlyContinue)?.Source
if($chrome){ Start-Process -FilePath $chrome -ArgumentList @($openUrl) } elseif($edge){ Start-Process -FilePath $edge -ArgumentList @($openUrl) } else { Start-Process -FilePath $openUrl }
Say "Boot OK — mode:$Mode url:$openUrl" 'OK'
try { while($true){ Start-Sleep -Seconds 3600 } } catch {}
