param(
  [string]$Url,
  [string]$File,
  [string]$Selectors = "$(Split-Path $PSCommandPath)\smoke_selectors.json",
  [int]$TimeoutMs = 8000
)
$ErrorActionPreference='Stop'
function Say([string]$m,[string]$lvl='INFO'){ $ts=(Get-Date).ToString('HH:mm:ss'); Write-Host "$ts [$lvl] $m" }
if(-not $Url -and -not $File){ Say 'smoke: need -Url or -File' 'ERROR'; exit 2 }
$target = $Url; if($File){ $full=(Resolve-Path $File).Path; if(-not (Test-Path $full)){ Say "smoke: file missing $full" 'ERROR'; exit 2 }; $target = "file:///$($full -replace '\\','/')" }
if(-not (Test-Path $Selectors)){ Say "smoke: selectors json missing $Selectors" 'ERROR'; exit 2 }
$sel = Get-Content -Raw -LiteralPath $Selectors | ConvertFrom-Json
$chrome = (Get-Command 'chrome.exe' -ErrorAction SilentlyContinue)?.Source
$edge   = (Get-Command 'msedge.exe' -ErrorAction SilentlyContinue)?.Source
$bin = $chrome; if(-not $bin){ $bin = $edge }
if(-not $bin){ Say 'smoke: no chrome/msedge found' 'ERROR'; exit 3 }

# Use headless dump-dom to capture final DOM (best-effort virtual time)
$cmdArgs = @('--headless=new','--disable-gpu',"--virtual-time-budget=$TimeoutMs",'--dump-dom', $target)
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $bin
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.Arguments = [string]::Join(' ', $cmdArgs)
$p = New-Object System.Diagnostics.Process
$p.StartInfo = $psi
$null = $p.Start()
$stdout = $p.StandardOutput.ReadToEnd()
$stderr = $p.StandardError.ReadToEnd()
$p.WaitForExit()

if($p.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($stdout)){
  Say ("smoke: headless dump failed code " + $p.ExitCode + " " + $stderr) 'ERROR'
  exit 4
}

# naive contains-checks for selectors; for headless, basic includes usually suffice
foreach($s in $sel.selectors){
  if($stdout -notmatch [Regex]::Escape($s.mustContain)){
    Say ("smoke: missing selector token: " + $s.mustContain) 'ERROR'
    exit 5
  }
}
Say 'SMOKE OK' 'OK'
exit 0
