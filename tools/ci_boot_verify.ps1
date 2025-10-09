$ErrorActionPreference = 'Stop'

# ---------- CONFIG ----------
$TotalBudgetMinutes = 360       # 6 hours; change if needed
$AttemptIntervalSec = 20        # wait between attempts
$PortRange = 8080..8090
$Selectors = @('view-dashboard','view-partners','view-longshots','view-calendar')  # DOM tokens expected in final HTML
# ---------- /CONFIG ----------

function Say([string]$m,[string]$lvl='INFO'){
  $ts=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $fg='Gray'; if($lvl -eq 'WARN'){$fg='Yellow'} elseif($lvl -eq 'ERROR'){$fg='Red'} elseif($lvl -eq 'OK'){$fg='Green'}
  Write-Host "$ts [$lvl] $m" -ForegroundColor $fg
}
function IsAdmin(){
  try{ $p=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }catch{ $false }
}
function FirstFreePort($range){
  foreach($p in $range){
    try{ $l=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,[int]$p); $l.Start(); $l.Stop(); return $p }catch{}
  }
  return $null
}
function BrowserBin(){
  $c = (Get-Command 'chrome.exe' -ErrorAction SilentlyContinue)?.Source
  if($c){ return $c }
  $e = (Get-Command 'msedge.exe' -ErrorAction SilentlyContinue)?.Source
  if($e){ return $e }
  return $null
}
function HttpProbe([string]$url){
  try{
    if((Get-Command Invoke-WebRequest).Parameters.ContainsKey('UseBasicParsing')){
      $r=Invoke-WebRequest -UseBasicParsing -Uri $url -Method Get -TimeoutSec 4
    } else {
      $r=Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 4
    }
    return $r.StatusCode
  }catch{ return $null }
}
function Serve-StartJob([string]$prefix,[string]$root,[string]$runlog){
  $job = Start-Job -Name ("CRMvFinal-"+([int](Get-Date -UFormat %s))) -InitializationScript {
    $ErrorActionPreference='Continue'
    function Mime([string]$p){
      switch([IO.Path]::GetExtension($p).ToLower()){
        '.html'{ 'text/html; charset=utf-8' } '.htm'{ 'text/html; charset=utf-8' } '.js'{ 'text/javascript; charset=utf-8' }
        '.mjs' { 'text/javascript; charset=utf-8' } '.css'{ 'text/css; charset=utf-8' } '.json'{ 'application/json; charset=utf-8' }
        '.svg'{ 'image/svg+xml' } '.ico'{ 'image/x-icon' } '.png'{ 'image/png' } '.jpg'{ 'image/jpeg' } '.jpeg'{ 'image/jpeg' }
        default{ 'application/octet-stream' }
      }
    }
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
  } -ArgumentList $prefix,$root,$runlog
  return $job
}
function Ensure-UrlAcl([string]$prefix){
  try{
    $probe = New-Object Net.HttpListener
    $probe.Prefixes.Add($prefix); $probe.Start(); $probe.Stop()
    return $true
  }catch{
    if($_.Exception.Message -match 'Access is denied|ACL'){
      $cmd = "netsh http add urlacl url=$prefix user=Everyone listen=yes"
      $hostExe = ($PSVersionTable.PSEdition -eq 'Core') ? 'pwsh.exe' : 'powershell.exe'
      if(!(IsAdmin)){ Start-Process -Verb RunAs -FilePath $hostExe -ArgumentList @('-NoLogo','-NoProfile','-Command', $cmd) | Out-Null; Start-Sleep -Seconds 2 }
      else { & netsh http add urlacl url=$prefix user=Everyone listen=yes | Out-Null }
      try{ $probe = New-Object Net.HttpListener; $probe.Prefixes.Add($prefix); $probe.Start(); $probe.Stop(); return $true }catch{ return $false }
    }
    return $false
  }
}
function DumpDom([string]$target,[int]$budgetMs,[ref]$stdout,[ref]$stderr){
  $bin = BrowserBin
  if(-not $bin){ $stderr.Value = 'no chrome/msedge found'; return 3 }
  $args = @('--headless=new','--disable-gpu',"--virtual-time-budget=$budgetMs",'--dump-dom', $target)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $bin; $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $argListProp = $psi.PSObject.Properties['ArgumentList']
  if($argListProp -and $psi.ArgumentList){
    foreach($arg in $args){
      [void]$psi.ArgumentList.Add($arg)
    }
  } else {
    $escape = {
      param([string]$value)
      $quote = [char]34
      if([string]::IsNullOrEmpty($value)){ return "$quote$quote" }
      if($value -notmatch '[\s"]'){ return $value }
      $escaped = $value -replace '(\\*)"', '$1$1"'
      $escaped = $escaped -replace '(\\+)$', '$1$1'
      return "$quote$escaped$quote"
    }
    $escapedArgs = $args | ForEach-Object { & $escape $_ }
    $psi.Arguments = [string]::Join(' ', $escapedArgs)
  }
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  $null = $p.Start()
  $o = $p.StandardOutput.ReadToEnd()
  $e = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  $stdout.Value = $o; $stderr.Value = $e
  return $p.ExitCode
}

# Paths
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$WebRoot  = (Resolve-Path (Join-Path $RepoRoot 'crm-app')).Path
$Index    = Join-Path $WebRoot 'index.html'
if(!(Test-Path -LiteralPath $Index)){ Say 'FATAL: crm-app\index.html missing' 'ERROR'; exit 10 }

# Unblock quietly
try { Get-ChildItem -LiteralPath $WebRoot -Recurse -File | ForEach-Object { Unblock-File -LiteralPath $_.FullName -ErrorAction SilentlyContinue } } catch {}

# Logs
$LogDir = Join-Path $env:TEMP 'crm_ci'
if(!(Test-Path -LiteralPath $LogDir)){ New-Item -ItemType Directory -Path $LogDir | Out-Null }
$RunLog = Join-Path $LogDir ("run_" + (Get-Date -Format 'yyyyMMdd_HHmmss') + ".log")
Say ("Run log: " + $RunLog)

# Main loop
$deadline = (Get-Date).AddMinutes($TotalBudgetMinutes)
$attempt = 0
$serverJob = $null
$mode = 'http'
$port = $null
$prefix = $null

while((Get-Date) -lt $deadline){
  $attempt++
  Say ("Attempt #" + $attempt) 'INFO'
  # stop prior job if any
  if($serverJob){ try{ Stop-Job $serverJob -Force -ErrorAction SilentlyContinue; Remove-Job $serverJob -Force -ErrorAction SilentlyContinue }catch{}; $serverJob=$null }
  $port = FirstFreePort $PortRange
  if(-not $port){ Say 'No free port 8080-8090' 'ERROR'; Start-Sleep -Seconds $AttemptIntervalSec; continue }
  $prefix = "http://127.0.0.1:$port/"

  $haveHttp = Ensure-UrlAcl $prefix
  if($haveHttp){
    $serverJob = Serve-StartJob -prefix $prefix -root $WebRoot -runlog $RunLog
    # simple readiness
    $ready=$false
    for($i=0;$i -lt 20;$i++){
      $code = HttpProbe ($prefix + 'index.html')
      if($code -eq 200){ $ready=$true; break }
      Start-Sleep -Milliseconds 200
    }
    if($ready){
      # headless DOM check
      $stdout = ''; $stderr = ''
      $rc = DumpDom ($prefix + 'index.html') 6000 ([ref]$stdout) ([ref]$stderr)
      if($rc -eq 0 -and -not [string]::IsNullOrWhiteSpace($stdout)){
        $missing = @()
        foreach($t in $Selectors){ if($stdout -notmatch [Regex]::Escape($t)){ $missing += $t } }
        if($missing.Count -eq 0){
          Say ("SMOKE OK (http) — Opening browser " + $prefix + "index.html") 'OK'
          $bin = BrowserBin
          $openUrl = $prefix + 'index.html?cb=' + [int](Get-Date -UFormat %s)
          if($bin){ Start-Process -FilePath $bin -ArgumentList @($openUrl) } else { Start-Process -FilePath $openUrl }
          Say ("Boot OK — url:" + $openUrl) 'OK'
          Say ("Tail log @ " + $RunLog) 'INFO'
          # keep window alive with server running
          Say 'Server running. Press Ctrl+C to stop. Window will remain open.' 'INFO'
          while($true){ Start-Sleep -Seconds 3600 }
        } else {
          Add-Content -LiteralPath $RunLog -Value ("missing tokens: " + ($missing -join ','))
          Say ("SMOKE MISS (http): " + ($missing -join ',')) 'WARN'
        }
      } else {
        Add-Content -LiteralPath $RunLog -Value ("dump-dom rc=" + $rc + " err=" + $stderr)
        Say ("dump-dom failed rc=" + $rc) 'WARN'
      }
    } else {
      Say 'http readiness failed' 'WARN'
    }
  } else {
    Say 'HttpListener not usable (ACL/policy). Trying file:// fallback' 'WARN'
    $mode='file'
    $stdout=''; $stderr=''
    $rc = DumpDom ("file:///" + ((Resolve-Path $Index).Path -replace '\\','/')) 6000 ([ref]$stdout) ([ref]$stderr)
    if($rc -eq 0 -and -not [string]::IsNullOrWhiteSpace($stdout)){
      $missing = @()
      foreach($t in $Selectors){ if($stdout -notmatch [Regex]::Escape($t)){ $missing += $t } }
      if($missing.Count -eq 0){
        Say ("SMOKE OK (file) — Opening index.html locally") 'OK'
        $bin = BrowserBin
        $openUrl = (Resolve-Path $Index).Path
        if($bin){ Start-Process -FilePath $bin -ArgumentList @($openUrl) } else { Start-Process -FilePath $openUrl }
        Say ("Boot OK — file mode url:" + $openUrl) 'OK'
        Say ("Tail log @ " + $RunLog) 'INFO'
        Say 'No server in file mode. Window will remain open.' 'INFO'
        while($true){ Start-Sleep -Seconds 3600 }
      } else {
        Add-Content -LiteralPath $RunLog -Value ("missing tokens (file): " + ($missing -join ','))
        Say ("SMOKE MISS (file): " + ($missing -join ',')) 'WARN'
      }
    } else {
      Add-Content -LiteralPath $RunLog -Value ("dump-dom file rc=" + $rc + " err=" + $stderr)
      Say ("dump-dom file failed rc=" + $rc) 'WARN'
    }
  }

  Say ("Retrying in " + $AttemptIntervalSec + "s… (log: " + $RunLog + ")") 'INFO'
  Start-Sleep -Seconds $AttemptIntervalSec
}

Say ("TIMEOUT — Could not verify DOM within " + $TotalBudgetMinutes + " minutes. See " + $RunLog) 'ERROR'
# Keep window open for inspection
try{ [void](Read-Host 'Press Enter to exit') } catch{}
exit 2
