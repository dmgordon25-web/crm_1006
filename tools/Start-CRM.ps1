[CmdletBinding()]
param(
    [int]$PreferredPort = 8080
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Log {
    param(
        [string]$Level,
        [string]$Message
    )
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "{0} [{1}] {2}" -f $timestamp, $Level, $Message
    Write-Host $line
    Add-Content -Path $Global:LogFile -Value $line
}

function Log-Info { param([string]$Message) Write-Log -Level 'INFO' -Message $Message }
function Log-Warn { param([string]$Message) Write-Log -Level 'WARN' -Message $Message }
function Log-Error { param([string]$Message) Write-Log -Level 'ERROR' -Message $Message }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
$webRoot = Join-Path $repoRoot 'crm-app'
if (-not (Test-Path -LiteralPath $webRoot)) {
    throw "WEBROOT missing: $webRoot"
}

$logDir = Join-Path $env:LOCALAPPDATA 'CRM\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$Global:LogFile = Join-Path $logDir ("Start-CRM_{0:yyyyMMdd_HHmmss}.log" -f (Get-Date))

try {
    Log-Info "Resolved repo root: $repoRoot"
    Log-Info "Using web root: $webRoot"

    function Test-PortAvailable {
        param([int]$Port)
        $listener = $null
        try {
            $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
            $listener.Start()
            return $true
        } catch {
            return $false
        } finally {
            if ($listener) { $listener.Stop() }
        }
    }

    function Get-AvailablePort {
        param([int]$Preferred)
        $candidates = New-Object System.Collections.Generic.List[int]
        if ($Preferred -gt 0) { [void]$candidates.Add($Preferred) }
        8075..8099 | ForEach-Object { if (-not $candidates.Contains($_)) { [void]$candidates.Add($_) } }
        foreach ($port in $candidates) {
            if (Test-PortAvailable -Port $port) { return $port }
        }
        throw 'No open port available in the expected range.'
    }

    $port = Get-AvailablePort -Preferred $PreferredPort
    $url = "http://127.0.0.1:$port/"

    $nodeCmd = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        $nodeCmd = Get-Command 'node' -ErrorAction SilentlyContinue
    }

    $serverProcess = $null
    $serverOut = Join-Path $logDir ("server_{0:yyyyMMdd_HHmmss}.log" -f (Get-Date))

    if ($nodeCmd) {
        $nodeScript = Join-Path $scriptDir 'node_static_server.js'
        $arguments = @($nodeScript, $webRoot, $port)
        Log-Info "Launching Node static server via $($nodeCmd.Source)"
        $serverProcess = Start-Process -FilePath $nodeCmd.Source -ArgumentList $arguments -WorkingDirectory $repoRoot -PassThru -NoNewWindow -RedirectStandardOutput $serverOut -RedirectStandardError $serverOut
    } else {
        Log-Warn 'Node not found in PATH. Falling back to PowerShell HttpListener.'
        $fallbackScript = Join-Path ([System.IO.Path]::GetTempPath()) ("crm_fallback_{0:N}.ps1" -f [guid]::NewGuid())
        $fallbackSource = @'
param(
    [string]$Root,
    [int]$Port,
    [string]$Log
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Net.HttpListener

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "{0} [SERVE] {1}" -f $timestamp, $Message
    Add-Content -Path $Log -Value $line
}

$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Log "PowerShell listener active on $prefix (root: $Root)"

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.htm'  = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript; charset=utf-8'
    '.mjs'  = 'application/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.gif'  = 'image/gif'
    '.webp' = 'image/webp'
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        try {
            $rawPath = $request.Url.AbsolutePath
            $decoded = [Uri]::UnescapeDataString($rawPath)
            if ([string]::IsNullOrEmpty($decoded) -or $decoded -eq '/') {
                $decoded = '/index.html'
            }
            $relative = $decoded.TrimStart('/')
            $targetPath = [System.IO.Path]::Combine($Root, $relative)
            $fullPath = [System.IO.Path]::GetFullPath($targetPath)
            if (-not $fullPath.StartsWith([System.IO.Path]::GetFullPath($Root))) {
                throw 'Forbidden'
            }
            if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                $response.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
                $contentType = $mime[$ext]
                if (-not $contentType) { $contentType = 'application/octet-stream' }
                $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                $response.ContentType = $contentType
                if ($ext -eq '.html') {
                    $response.Headers['Cache-Control'] = 'no-cache'
                } else {
                    $response.Headers['Cache-Control'] = 'public, max-age=60'
                }
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } catch {
            if ($_.Exception.Message -eq 'Forbidden') {
                $response.StatusCode = 403
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                Write-Log "Serve error: $($_.Exception.Message)"
                $response.StatusCode = 500
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Internal Server Error')
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } finally {
            $response.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
}
'@
        Set-Content -Path $fallbackScript -Value $fallbackSource -Encoding UTF8
        $pwsh = if (Test-Path (Join-Path $PSHOME 'pwsh.exe')) {
            Join-Path $PSHOME 'pwsh.exe'
        } elseif (Test-Path (Join-Path $PSHOME 'powershell.exe')) {
            Join-Path $PSHOME 'powershell.exe'
        } else {
            'powershell.exe'
        }
        $serverProcess = Start-Process -FilePath $pwsh -ArgumentList @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',$fallbackScript,$webRoot,$port,$serverOut) -WorkingDirectory $repoRoot -PassThru -WindowStyle Hidden
        Register-ObjectEvent -InputObject $serverProcess -EventName Exited -Action { Remove-Item -Path $using:fallbackScript -ErrorAction SilentlyContinue } | Out-Null
    }

    if (-not $serverProcess) {
        throw 'Failed to start HTTP server.'
    }

    Log-Info "Starting server on $url"

    function Wait-ServerReady {
        param([string]$PingUrl, [int]$TimeoutSeconds = 20)
        $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
        while ((Get-Date) -lt $deadline) {
            try {
                $response = Invoke-WebRequest -Uri $PingUrl -Method Head -UseBasicParsing -TimeoutSec 2
                if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                    return $true
                }
            } catch {
                Start-Sleep -Milliseconds 250
            }
        }
        return $false
    }

    if (-not (Wait-ServerReady -PingUrl $url -TimeoutSeconds 25)) {
        throw "Server failed to respond at $url"
    }

    function Launch-Browser {
        param([string]$TargetUrl)
        $browsers = @('chrome.exe','msedge.exe','chrome','msedge')
        foreach ($name in $browsers) {
            $cmd = Get-Command $name -ErrorAction SilentlyContinue
            if ($cmd) {
                Start-Process -FilePath $cmd.Source -ArgumentList $TargetUrl | Out-Null
                return $true
            }
        }
        Start-Process $TargetUrl | Out-Null
        return $true
    }

    Launch-Browser -TargetUrl $url | Out-Null
    Log-Info 'Browser launched'

    Log-Info "Waiting on server process PID $($serverProcess.Id)"
    Wait-Process -Id $serverProcess.Id
    exit 0
} catch {
    Log-Error $_.Exception.Message
    if ($serverProcess -and -not $serverProcess.HasExited) {
        try { $serverProcess.Kill() } catch {}
    }
    exit 1
}
