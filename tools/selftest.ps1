Param(
    [switch]$SkipExe,
    [switch]$SkipFallback
)
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot

function New-TempFilePath {
    $name = "crm_launcher_{0}.log" -f ([Guid]::NewGuid().ToString("N"))
    return Join-Path ([System.IO.Path]::GetTempPath()) $name
}

function Wait-ForLaunchOk {
    Param(
        [System.Diagnostics.Process]$Process,
        [string]$OutputPath,
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if ($Process.HasExited) {
            throw "Process exited before reporting readiness. See $OutputPath"
        }

        if (Test-Path $OutputPath) {
            $lines = Get-Content -Path $OutputPath
            foreach ($line in $lines) {
                if ($line -match "LAUNCH OK : http://localhost:(\\d+)") {
                    return [int]$matches[1]
                }
            }
        }

        Start-Sleep -Milliseconds 200
    }

    throw "Timed out waiting for LAUNCH OK. See $OutputPath"
}

function Assert-PortFree {
    Param([int]$Port)
    Start-Sleep -Milliseconds 500
    try {
        $busy = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue -InformationLevel Quiet
        if ($busy) {
            throw "Port $Port is still in use"
        }
    } catch {
        throw "Unable to confirm that port $Port is free: $($_.Exception.Message)"
    }
}

if (-not $SkipExe) {
    $launcherPath = Join-Path $repoRoot "Start CRM.exe"
    if (Test-Path $launcherPath) {
        Write-Host "Testing Start CRM.exe"
        $stdoutPath = New-TempFilePath
        $stderrPath = New-TempFilePath
        try {
            $proc = Start-Process -FilePath $launcherPath -ArgumentList "--port","0","--open","false" -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
            $port = Wait-ForLaunchOk -Process $proc -OutputPath $stdoutPath -TimeoutSeconds 20
            Write-Host ("\tReported port: {0}" -f $port)
            Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue
            Wait-Process -Id $proc.Id -ErrorAction SilentlyContinue
            Assert-PortFree -Port $port
            Write-Host "\tPort released"
        } finally {
            if (Test-Path $stdoutPath) { Remove-Item $stdoutPath -ErrorAction SilentlyContinue }
            if (Test-Path $stderrPath) { Remove-Item $stderrPath -ErrorAction SilentlyContinue }
        }
    } else {
        Write-Warning "Start CRM.exe not found. Build the launcher first."
    }
}

if (-not $SkipFallback) {
    $psScript = Join-Path $repoRoot "tools\\Start-CRM.ps1"
    if (Test-Path $psScript) {
        Write-Host "Testing PowerShell fallback"
        $stdoutPath = New-TempFilePath
        $stderrPath = New-TempFilePath
        $psExe = Join-Path $env:SystemRoot "System32\\WindowsPowerShell\\v1.0\\powershell.exe"
        try {
            $arguments = @("-NoProfile","-ExecutionPolicy","Bypass","-File",$psScript,"-PreferredPort",8080,"-NoBrowser")
            $proc = Start-Process -FilePath $psExe -ArgumentList $arguments -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
            $port = Wait-ForLaunchOk -Process $proc -OutputPath $stdoutPath -TimeoutSeconds 20
            Write-Host ("\tReported port: {0}" -f $port)
            Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue
            Wait-Process -Id $proc.Id -ErrorAction SilentlyContinue
            Assert-PortFree -Port $port
            Write-Host "\tPort released"
        } finally {
            if (Test-Path $stdoutPath) { Remove-Item $stdoutPath -ErrorAction SilentlyContinue }
            if (Test-Path $stderrPath) { Remove-Item $stderrPath -ErrorAction SilentlyContinue }
        }
    } else {
        Write-Warning "tools/Start-CRM.ps1 not found."
    }
}

Write-Host "Self-test complete."
