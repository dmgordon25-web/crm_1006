[CmdletBinding()]
param(
  [switch]$KeepOpen,

  # Catch-all must be BEFORE WebRoot so unlabeled args don't get swallowed
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Remaining,

  # Named-only (huge Position) + guard below
  [Parameter(Mandatory=$false, Position=2147483647)]
  [string]$WebRoot
)
# Honor -WebRoot only if explicitly passed
if (-not $PSBoundParameters.ContainsKey('WebRoot')) { $WebRoot = $null }

# ---------- hard logging scaffold ----------
$ErrorActionPreference = 'Stop'
$global:LAUNCH_FAILED = $false
try {
  $LogRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'CRM\logs' } else { Join-Path (Split-Path $PSScriptRoot -Parent) 'logs' }
  New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
} catch {
  $LogRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'logs'
  New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
}
$LogPath = Join-Path $LogRoot ("launcher-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
$StateFile = Join-Path $LogRoot 'serve-state.json'

function Write-Log([string]$msg) {
  $ts = (Get-Date).ToString('u')
  "$ts  $msg" | Tee-Object -FilePath $LogPath -Append | Out-Host
}

trap {
  $global:LAUNCH_FAILED = $true
  Write-Log ("FATAL: {0}`n{1}" -f $_.Exception.Message, $_.InvocationInfo.PositionMessage)
  continue
}

Write-Log "[BOOT] Start-CRM.ps1 begin"

# ---------- PS 5.1-safe env banner ----------
function Get-CmdName([string]$n) {
  try { $c = Get-Command $n -ErrorAction SilentlyContinue } catch { $c = $null }
  if ($c) { return $c.Name } else { return '' }
}
function Write-EnvBanner {
  if ($script:ENV_BANNER_PRINTED) { return }
  $script:ENV_BANNER_PRINTED = $true
  Write-Log ("[INFO] PSVersion={0} Arch={1}" -f $PSVersionTable.PSVersion, $env:PROCESSOR_ARCHITECTURE)
  $p  = Get-CmdName 'python'
  $py = Get-CmdName 'py'
  $nd = Get-CmdName 'node'
  Write-Log ("[INFO] Paths: python={0} py={1} node={2}" -f $p,$py,$nd)
}
Write-EnvBanner

function Test-ServerAlive([string]$Url) {
  if (-not $Url) { return $false }
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) { return $true }
  } catch { }
  return $false
}

function Start-CrmBrowser {
  param(
    [Parameter(Mandatory=$true)][string]$Url,
    [switch]$Wait
  )

  $chrome = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  $edge = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1

  $args = "--new-window `"$Url`""
  $proc = $null
  try {
    if ($chrome) {
      $proc = Start-Process -FilePath $chrome -ArgumentList $args -PassThru
    } elseif ($edge) {
      $proc = Start-Process -FilePath $edge -ArgumentList $args -PassThru
    } else {
      $proc = Start-Process -FilePath $Url -PassThru
    }
  } catch {
    Write-Log "[WARN] Failed to launch browser for reuse: $($_.Exception.Message)"
  }

  if ($Wait -and $proc -and $proc.Id) {
    try { Wait-Process -Id $proc.Id } catch {}
  }
  return $proc
}

function Try-ReuseExistingServer {
  if (-not (Test-Path $StateFile)) { return $false }

  $state = $null
  try {
    $raw = Get-Content -Path $StateFile -Raw -ErrorAction Stop
    if ($raw) { $state = $raw | ConvertFrom-Json }
  } catch {
    Write-Log "[WARN] Unable to read existing server state. Removing stale file."
    try { Remove-Item -Path $StateFile -Force -ErrorAction SilentlyContinue } catch {}
    return $false
  }

  if (-not $state -or -not $state.Url) {
    try { Remove-Item -Path $StateFile -Force -ErrorAction SilentlyContinue } catch {}
    return $false
  }

  $targetUrl = [string]$state.Url
  if (Test-ServerAlive -Url $targetUrl) {
    Write-Log "[INFO] Existing CRM server detected at $targetUrl"
    Start-CrmBrowser -Url $targetUrl
    Write-Log "[EXIT] Reused running server."
    exit 0
  }

  Write-Log "[INFO] Removing stale server state at $StateFile"
  try { Remove-Item -Path $StateFile -Force -ErrorAction SilentlyContinue } catch {}
  return $false
}

Try-ReuseExistingServer | Out-Null

# ---------- ExecutionPolicy (process scope only; NEVER relaunch) ----------
try {
  $cur = Get-ExecutionPolicy -Scope Process -ErrorAction SilentlyContinue
  if ($cur -ne 'Bypass' -and $cur -ne 'Unrestricted') {
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force -ErrorAction Stop
    Write-Log "[INFO] ExecutionPolicy(Process)=Bypass"
  } else {
    Write-Log "[INFO] ExecutionPolicy(Process)=$cur"
  }
} catch { Write-Log "[WARN] Unable to set ExecutionPolicy(Process): $($_.Exception.Message)" }
Write-Log "[INFO] No relaunch; continuing in current process."

# ---------- Web-root autodetect (rename-safe) ----------
function Resolve-WebRoot([string]$Hint) {
  if ($Hint -and (Test-Path $Hint)) { return (Resolve-Path $Hint).Path }
  if ($env:CRM_WEBROOT -and (Test-Path $env:CRM_WEBROOT)) { return (Resolve-Path $env:CRM_WEBROOT).Path }

  $repo = (Split-Path $PSScriptRoot -Parent)
  $candidates = @()

  # Prefer a folder named 'crm-app'
  $crmApp = Join-Path $repo 'crm-app'
  if (Test-Path $crmApp) { $candidates += (Get-Item $crmApp) }

  # Direct children that look like the app
  $children = Get-ChildItem $repo -Directory -ErrorAction SilentlyContinue
  foreach ($d in $children) {
    $hasIndex = Test-Path (Join-Path $d.FullName 'index.html')
    $hasLoader = (Test-Path (Join-Path $d.FullName 'js\patches\loader.js')) -or (Test-Path (Join-Path $d.FullName 'js\boot\loader.js'))
    if ($hasIndex -and $hasLoader) { $candidates += $d }
  }

  # Fallback: any folder containing index.html (deep)
  if (-not $candidates) {
    $deep = Get-ChildItem $repo -Directory -Recurse -ErrorAction SilentlyContinue
    foreach ($d in $deep) {
      if (Test-Path (Join-Path $d.FullName 'index.html')) { $candidates += $d }
    }
  }

  if ($candidates -and $candidates.Count -gt 0) {
    $loaders = @('js/patches/loader.js', 'js/boot/loader.js')
    $sorted = $candidates | Sort-Object LastWriteTime -Descending
    foreach ($pick in $sorted) {
      $probeTargets = @($pick.FullName)
      $nested = Join-Path $pick.FullName 'crm-app'
      if (Test-Path $nested) { $probeTargets += $nested }

      foreach ($target in $probeTargets) {
        $index = Join-Path $target 'index.html'
        if (-not (Test-Path $index)) { continue }

        $hasLoader = $false
        foreach ($rel in $loaders) {
          if (Test-Path (Join-Path $target $rel)) { $hasLoader = $true; break }
        }

        $cssPath = Join-Path $target 'css/app.css'
        if ($hasLoader -or (Test-Path $cssPath)) {
          $resolved = (Resolve-Path $target).Path
          # Soft CSS sanity (warn only)
          try {
            $idx = Join-Path $resolved 'index.html'
            $html = [System.IO.File]::ReadAllText($idx)
            $hrefs = [regex]::Matches($html, '<link[^>]+rel=["'']stylesheet["''][^>]+href=["'']([^"'']+)["'']', 'IgnoreCase') | ForEach-Object { $_.Groups[1].Value }
            $foundCss = $false
            foreach($h in $hrefs){ if ($h -notmatch '^https?://') { $p = Join-Path $resolved $h; if (Test-Path $p) { $foundCss = $true; break } } }
            if (-not $foundCss) {
              $anyCss = Get-ChildItem -Path $resolved -Filter *.css -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
              if (-not $anyCss) { Write-Warning "[START] No local CSS files detected under $resolved. The app may appear unstyled if CDN/style paths are wrong." }
            }
          } catch { Write-Verbose "[START] CSS heuristic skipped: $($_.Exception.Message)" }
          return $resolved
        }
      }
    }
  }

  throw "Web root not found under $repo. Pass -WebRoot '.\crm-app' or set CRM_WEBROOT."
}

try {
  $ResolvedWebRoot = Resolve-WebRoot -Hint $WebRoot
  Write-Log "[INFO] WEBROOT: $ResolvedWebRoot"
} catch {
  $global:LAUNCH_FAILED = $true
  Write-Log "[ERROR] $($_.Exception.Message)"
  Write-Host "Could not locate the app folder (web root)." -ForegroundColor Red
  Write-Host "Fix options:" -ForegroundColor Yellow
  Write-Host "  1) Rename your tool folder to 'crm-app' (recommended) OR"
  Write-Host "  2) Run:  .\tools\Start-CRM.ps1 -WebRoot '.\path\to\app'"
  Write-Host "Log: $LogPath"
  Write-Host "Press Enter to close..."
  [void][Console]::ReadLine()
  exit 1
}

# ---------- Invoke serve.ps1 and propagate status (no nested exit) ----------
$serve = Join-Path $PSScriptRoot 'serve.ps1'
$serveExit = 0
try {
  & $serve -WorkingDirectory $ResolvedWebRoot -StateFile $StateFile @Remaining
  if ($null -ne $LASTEXITCODE) { $serveExit = [int]$LASTEXITCODE } else { $serveExit = 0 }
  if ($serveExit -ne 0) { throw "Server failed with exit code $serveExit" }
} catch {
  $global:LAUNCH_FAILED = $true
  Write-Log ("[ERROR] {0}" -f $_.Exception.Message)
} finally {
  if ($LAUNCH_FAILED -or $serveExit -ne 0) {
    Write-Log "[EXIT] failure. Log: $LogPath"
    Write-Host "Launcher failed. See log:`n$LogPath" -ForegroundColor Red
    if (-not $KeepOpen) {
      Write-Host "Press Enter to close..."
      [void][Console]::ReadLine()
    }
    exit 1
  } else {
    Write-Log "[EXIT] success."
    try {
      # If we reached here, server is up and browser launched; exit this host so the console closes.
      # Respect the explicit CRM_DEBUG escape hatch so developers can keep the host open when needed.
      if (-not $env:CRM_DEBUG) {
        Start-Sleep -Seconds 1
        $host.SetShouldExit(0)
        exit
      }
    } catch { }
    exit 0
  }
}
