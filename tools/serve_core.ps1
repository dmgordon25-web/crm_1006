# Lightweight server only (not used by default). For manual debug.
param([int]$Port=8080)

# ---- ASCII GUARD (do not remove) ----
try {
  $__bytes = [System.IO.File]::ReadAllBytes($MyInvocation.MyCommand.Path)
  foreach($__b in $__bytes){ if($__b -gt 127){ Write-Host "ASCII-GUARD: Non-ASCII bytes detected in $($MyInvocation.MyCommand.Name)" -ForegroundColor Red; exit 3 } }
} catch { }
# ---- END ASCII GUARD ----

$ErrorActionPreference='Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$WebRoot  = (Resolve-Path (Join-Path $RepoRoot 'crm-app')).Path
$Index    = Join-Path $WebRoot 'index.html'
if(!(Test-Path -LiteralPath $Index)){ Write-Host "Missing crm-app\index.html"; exit 10 }
function Mime([string]$p){
  switch([IO.Path]::GetExtension($p).ToLower()){
    '.html'{ 'text/html; charset=utf-8' } '.htm'{ 'text/html; charset=utf-8' } '.js'{ 'text/javascript; charset=utf-8' }
    '.mjs'{ 'text/javascript; charset=utf-8' } '.css'{ 'text/css; charset=utf-8' } '.json'{ 'application/json; charset=utf-8' }
    '.svg'{ 'image/svg+xml' } '.ico'{ 'image/x-icon' } '.png'{ 'image/png' } '.jpg'{ 'image/jpeg' } '.jpeg'{ 'image/jpeg' }
    default{ 'application/octet-stream' }
  }
}
$Prefix = "http://127.0.0.1:$Port/"
$l = New-Object Net.HttpListener
$l.Prefixes.Add($Prefix); $l.Start()
Write-Host "Server up on $Prefix"
while($l.IsListening){
  try{
    $ctx=$l.GetContext(); $req=$ctx.Request; $res=$ctx.Response
    $res.Headers['Cache-Control']='no-cache'
    $path = if([string]::IsNullOrWhiteSpace($req.Url.AbsolutePath) -or $req.Url.AbsolutePath -eq '/'){ '/index.html' } else { $req.Url.AbsolutePath }
    $fs = Join-Path $WebRoot ($path.TrimStart('/') -replace '/', [IO.Path]::DirectorySeparatorChar)
    if(Test-Path -LiteralPath $fs){
      $b=[IO.File]::ReadAllBytes($fs)
      $res.StatusCode=200; $res.ContentType=(Mime $fs); $res.ContentLength64=$b.Length
      $res.OutputStream.Write($b,0,$b.Length)
    } else { $res.StatusCode=404 }
  } catch { try{ $res.StatusCode=500 }catch{} }
  finally { try{ $res.OutputStream.Close() }catch{}; try{ $res.Close() }catch{} }
}
