#requires -version 5.1
# ---- ASCII GUARD (do not remove) ----
try {
  $__bytes = [System.IO.File]::ReadAllBytes($MyInvocation.MyCommand.Path)
  foreach($__b in $__bytes){ if($__b -gt 127){ Write-Host "ASCII-GUARD: Non-ASCII bytes detected in $($MyInvocation.MyCommand.Name)" -ForegroundColor Red; exit 3 } }
} catch { }
# ---- END ASCII GUARD ----
$ErrorActionPreference = 'Stop'

function say([string]$m,[string]$lvl='INFO'){
  $ts=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $fg='Gray'; if($lvl -eq 'WARN'){$fg='Yellow'} elseif($lvl -eq 'ERROR'){$fg='Red'} elseif($lvl -eq 'OK'){$fg='Green'}
  Write-Host "$ts [$lvl] $m" -ForegroundColor $fg
}

# ASCII guard: bail if this script contains non-ASCII bytes
$bytes = [System.IO.File]::ReadAllBytes($MyInvocation.MyCommand.Path)
foreach($b in $bytes){ if($b -gt 127){ say "ASCII-GUARD: Non-ASCII bytes detected in this script." 'ERROR'; exit 3 } }

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$webRoot  = (Resolve-Path -LiteralPath (Join-Path $repoRoot 'crm-app')).Path
$index    = Join-Path $webRoot 'index.html'

if(-not (Test-Path -LiteralPath $webRoot)){ say "Missing folder: crm-app" 'ERROR'; exit 2 }
if(-not (Test-Path -LiteralPath $index)){   say "Missing file: crm-app\index.html" 'ERROR'; exit 2 }

try {
  $len=(Get-Item -LiteralPath $index).Length
  if($len -lt 100){ say "index.html too small: $len bytes" 'ERROR'; exit 2 }
} catch {
  say ("Cannot read index.html: " + $_.Exception.Message) 'ERROR'
  exit 2
}

say "VERIFY OK: basic boot files present" 'OK'
exit 0
