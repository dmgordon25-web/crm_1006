$script:LogPath=$null
$script:RepoRoot=$null

function Get-ModuleRoot {
    try {
        if ($PSScriptRoot) { return $PSScriptRoot }
    } catch {}
    try { return (Split-Path -Parent $MyInvocation.MyCommand.Path) } catch { return (Get-Location).Path }
}

function Get-RepoRoot {
    if ($script:RepoRoot) { return $script:RepoRoot }
    $moduleRoot = Get-ModuleRoot
    $toolsDir = $moduleRoot
    try { $toolsDir = (Resolve-Path -LiteralPath $moduleRoot -ErrorAction Stop).ProviderPath } catch {}
    $parent = Split-Path -Parent $toolsDir
    if (-not $parent) { $parent = $toolsDir }
    try { $repo = (Resolve-Path -LiteralPath (Join-Path $toolsDir '..') -ErrorAction Stop).ProviderPath } catch { $repo = $parent }
    if (-not $repo) { $repo = $toolsDir }
    $script:RepoRoot = $repo
    return $repo
}

function Resolve-WebRootCandidate {
    param([string]$Candidate)
    if (-not $Candidate) { return $null }
    $repo = Get-RepoRoot
    $probes = New-Object System.Collections.Generic.List[string]
    if ([System.IO.Path]::IsPathRooted($Candidate)) {
        $probes.Add($Candidate) | Out-Null
    } else {
        try { $probes.Add((Join-Path (Get-Location).Path $Candidate)) | Out-Null } catch {}
        if ($repo) { $probes.Add((Join-Path $repo $Candidate)) | Out-Null }
    }
    foreach ($probe in $probes) {
        if (-not $probe) { continue }
        try { return (Resolve-Path -LiteralPath $probe -ErrorAction Stop).ProviderPath } catch {}
    }
    return $null
}

function Test-WebRoot {
    param([string]$Path)
    if (-not $Path) { return $false }
    try { $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath } catch { return $false }
    $index = Join-Path $resolved 'index.html'
    if (-not (Test-Path -LiteralPath $index)) { return $false }
    foreach ($relative in @('js\\patches\\loader.js','js\\boot\\loader.js')) {
        if (Test-Path -LiteralPath (Join-Path $resolved $relative)) { return $true }
    }
    return $false
}

function Resolve-WebRoot {
    param([string]$Hint)

    $candidate = Resolve-WebRootCandidate $Hint
    if ($candidate -and (Test-WebRoot $candidate)) { return $candidate }

    $envCandidate = [string]$env:CRM_WEBROOT
    $candidate = Resolve-WebRootCandidate $envCandidate
    if ($candidate -and (Test-WebRoot $candidate)) { return $candidate }

    $repoRoot = Get-RepoRoot
    if ($repoRoot -and (Test-Path -LiteralPath $repoRoot)) {
        $matches = New-Object System.Collections.Generic.List[object]
        $seen = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
        try { $indexFiles = Get-ChildItem -Path $repoRoot -Filter 'index.html' -File -Recurse -ErrorAction Stop } catch { $indexFiles = @() }
        foreach ($file in $indexFiles) {
            $dir = $file.Directory.FullName
            if (-not $dir) { continue }
            if (-not $seen.Add($dir)) { continue }
            if (Test-WebRoot $dir) {
                try { $item = Get-Item -LiteralPath $dir -ErrorAction Stop } catch { $item = $null }
                $matches.Add([pscustomobject]@{ Path = $dir; LastWriteTime = if ($item) { $item.LastWriteTime } else { $file.LastWriteTime } }) | Out-Null
            }
        }
        if ($matches.Count -gt 0) {
            return ($matches | Sort-Object -Property LastWriteTime -Descending | Select-Object -First 1).Path
        }

        try { $fallback = Get-ChildItem -Path $repoRoot -Filter 'CRM_GOLDEN_*' -Directory -Recurse -ErrorAction Stop } catch { $fallback = @() }
        foreach ($dirInfo in $fallback | Sort-Object -Property LastWriteTime -Descending) {
            $indexPath = Join-Path $dirInfo.FullName 'index.html'
            if (Test-Path -LiteralPath $indexPath) {
                try { return (Resolve-Path -LiteralPath $dirInfo.FullName -ErrorAction Stop).ProviderPath } catch { return $dirInfo.FullName }
            }
        }
    }

    throw 'Web root not found'
}

function Get-LauncherLogPath { $script:LogPath }
function Write-Log {
    param([Parameter(Mandatory=$true,Position=0)][string]$Message,[ValidateSet('INFO','WARN','ERROR','DEBUG')][string]$Level='INFO')
    $line="[{0}] [{1}] {2}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'),$Level,$Message
    if ($script:LogPath) { try { Add-Content -Path $script:LogPath -Value $line -Encoding UTF8 } catch {} }
    if ($VerbosePreference -eq 'Continue') { Write-Verbose ("[{0}] {1}" -f $Level,$Message) }
}
function Initialize-LauncherLogging {
    $base=$env:LOCALAPPDATA
    if (-not $base -or -not (Test-Path -LiteralPath $base)) { $base=[System.IO.Path]::GetTempPath() }
    $dir=Join-Path (Join-Path $base 'CRM') 'logs'
    try { if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null } }
    catch {
        $dir=Join-Path (Join-Path ([System.IO.Path]::GetTempPath()) 'CRM') 'logs'
        if (-not (Test-Path -LiteralPath $dir)) { try { New-Item -ItemType Directory -Path $dir -Force | Out-Null } catch {} }
    }
    $path=Join-Path $dir ("launcher-{0}.log" -f (Get-Date).ToString('yyyyMMdd-HHmmss'))
    try { if (-not (Test-Path -LiteralPath $path)) { New-Item -ItemType File -Path $path -Force | Out-Null } } catch {}
    $script:LogPath=$path
    $path
}
function Test-PortFree {
    param([int]$Port)
    $l=$null
    try { $l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$Port);$l.Start();return $true }
    catch { return $false }
    finally { if ($l) { try { $l.Stop() } catch {} } }
}
function Start-HttpListenerServer {
    param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][int]$Port)
    $root=(Resolve-Path -LiteralPath $Root -ErrorAction Stop).ProviderPath
    $listener=[System.Net.HttpListener]::new();$listener.IgnoreWriteExceptions=$true
    foreach ($prefix in @("http://127.0.0.1:$Port/","http://localhost:$Port/")) { try { $listener.Prefixes.Add($prefix) } catch {} }
    try { $listener.Start() } catch { throw $_ }
    $cts=[System.Threading.CancellationTokenSource]::new()
    $mime=@{'.js'='application/javascript';'.css'='text/css';'.json'='application/json';'.ico'='image/x-icon';'.png'='image/png';'.svg'='image/svg+xml';'.map'='application/json';'.html'='text/html';'.htm'='text/html'}
    $logPath=$script:LogPath
    $task=[System.Threading.Tasks.Task]::Factory::StartNew({
        param($state)
        $listener=$state.Listener;$root=$state.Root;$token=$state.Token;$mime=$state.Mime;$logPath=$state.Log;$port=$state.Port
        $buffer=New-Object byte[] 65536
        function AppendLog([string]$msg){ if($logPath){ try{[System.IO.File]::AppendAllText($logPath,"[{0}] [HTTP:{1}] {2}`n" -f ([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss')),$port,$msg)}catch{}} }
        AppendLog 'HttpListener worker started.'
        while(-not $token.IsCancellationRequested){
            try{ $context=$listener.GetContext() }catch{ if(-not $listener.IsListening){ break } AppendLog("GetContext failed: $($_.Exception.Message)"); continue }
            if(-not $context){ continue }
            $request=$context.Request;$response=$context.Response
            try{
                $path=[System.Uri]::UnescapeDataString($request.Url.AbsolutePath)
                if(-not $path -or $path -eq '/'){ $path='/index.html' }
                $rel=$path.TrimStart('/')
                if($rel.Contains('..')){ $response.StatusCode=400;$response.Close();continue }
                $file=Join-Path $root $rel
                if(-not (Test-Path -LiteralPath $file)){ $response.StatusCode=404;$response.Close();continue }
                $ext=[System.IO.Path]::GetExtension($file).ToLowerInvariant()
                $response.ContentType=if($mime.ContainsKey($ext)){ $mime[$ext] }else{ 'application/octet-stream' }
                $response.Headers['Cache-Control']='no-store';$response.Headers['Accept-Ranges']='bytes'
                $stream=$null
                try{
                    $stream=[System.IO.File]::Open($file,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::ReadWrite)
                    $length=$stream.Length;$start=0;$end=if($length -gt 0){ $length-1 }else{ -1 }
                    $range=$request.Headers['Range']
                    if($range -and $range -match 'bytes=(\d*)-(\d*)'){
                        if($Matches[1]){ $start=[int64]$Matches[1] }
                        if($Matches[2]){ $end=[int64]$Matches[2] }else{ $end=$length-1 }
                        if($end -ge $length){ $end=$length-1 }
                        if($start -lt 0){ $start=0 }
                        if($end -lt $start){ $end=$length-1 }
                        $response.StatusCode=206
                        $response.Headers['Content-Range']="bytes {0}-{1}/{2}" -f $start,$end,$length
                    }else{ $response.StatusCode=200 }
                    $bytes=if($end -ge $start -and $end -ge 0){ $end-$start+1 }else{ 0 }
                    if($bytes -lt 0){ $bytes=0 }
                    $response.ContentLength64=$bytes
                    if($request.HttpMethod -ne 'HEAD' -and $bytes -gt 0){
                        $stream.Seek($start,[System.IO.SeekOrigin]::Begin)|Out-Null
                        $remaining=$bytes
                        while($remaining -gt 0){
                            $read=$stream.Read($buffer,0,[System.Math]::Min($buffer.Length,$remaining))
                            if($read -le 0){ break }
                            $response.OutputStream.Write($buffer,0,$read)
                            $remaining-=$read
                        }
                    }
                    $response.OutputStream.Close()
                }finally{ if($stream){ try{$stream.Dispose()}catch{} } }
            }catch{
                try{ $response.StatusCode=500;$response.OutputStream.Close() }catch{}
                AppendLog("Request handling error: $($_.Exception.Message)")
            }finally{ try{ $response.Close() }catch{} }
        }
        AppendLog 'HttpListener worker stopped.'
    },[pscustomobject]@{Listener=$listener;Root=$root;Token=$cts;Mime=$mime;Log=$logPath;Port=$Port},$cts.Token,[System.Threading.Tasks.TaskCreationOptions]::LongRunning,[System.Threading.Tasks.TaskScheduler]::Default)
    [pscustomobject]@{Type='HttpListener';Listener=$listener;Cancellation=$cts;Task=$task;Port=$Port}
}
function Wait-ServerReady {
    param([Parameter(Mandatory=$true)][string]$Url,[int]$TimeoutSeconds=60)
    $deadline=(Get-Date).AddSeconds($TimeoutSeconds);$attempt=0;$delay=1
    do{
        $attempt++;Write-Log -Level 'DEBUG' -Message ("Probing {0} (attempt {1})" -f $Url,$attempt)
        try{ $response=Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5; if($response.StatusCode -ge 200 -and $response.StatusCode -lt 500){ Write-Log ("Server ready after {0} attempts" -f $attempt);return $true } }
        catch{ Write-Log -Level 'DEBUG' -Message ("Probe failed: {0}" -f $_.Exception.Message) }
        Start-Sleep -Seconds $delay
        if($delay -lt 5){ $delay*=2;if($delay -gt 5){ $delay=5 } }
    }while((Get-Date) -lt $deadline)
    throw "Server did not respond at $Url within $TimeoutSeconds seconds."
}
function Stop-Child {
    param($Handle)
    if(-not $Handle){ return }
    try{
        switch($Handle.Type){
            'Process'{
                if($Handle.Process -and -not $Handle.Process.HasExited){ try{ Stop-Process -Id $Handle.Process.Id -ErrorAction Stop }catch{} }
                if($Handle.Wrapper -and -not $Handle.Wrapper.HasExited -and ($Handle.Process -and $Handle.Wrapper.Id -ne $Handle.Process.Id)){ try{ Stop-Process -Id $Handle.Wrapper.Id -ErrorAction Stop }catch{} }
            }
            'HttpListener'{
                if($Handle.Cancellation){ try{ $Handle.Cancellation.Cancel() }catch{} }
                if($Handle.Listener){ try{ $Handle.Listener.Stop() }catch{};try{ $Handle.Listener.Close() }catch{} }
                if($Handle.Task){ try{ $Handle.Task.Wait(2000) }catch{} }
            }
            default{
                if($Handle -is [System.Diagnostics.Process]){ if(-not $Handle.HasExited){ try{ Stop-Process -Id $Handle.Id -ErrorAction Stop }catch{} } }
                elseif($Handle -is [System.Net.HttpListener]){ try{ $Handle.Stop() }catch{};try{ $Handle.Close() }catch{} }
            }
        }
    }catch{ Write-Log -Level 'WARN' -Message ("Cleanup error: {0}" -f $_.Exception.Message) }
}
Export-ModuleMember -Function Initialize-LauncherLogging,Write-Log,Test-PortFree,Start-HttpListenerServer,Wait-ServerReady,Stop-Child,Get-LauncherLogPath,Test-WebRoot,Resolve-WebRoot
