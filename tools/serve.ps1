[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)]
  [string]$WorkingDirectory,
  [int]$Port,
  [string]$StateFile
)

$ErrorActionPreference = 'Stop'
$script:ServerProcess = $null   # python/py/npx child
$script:ServerJob     = $null   # HttpListener job if used

trap {
  Write-Output ("[SERVE:FATAL] {0}`n{1}" -f $_.Exception.Message, $_.InvocationInfo.PositionMessage)
  throw  # bubble to Start-CRM.ps1 (DO NOT exit here)
}

if (-not (Test-Path $WorkingDirectory)) { throw "WorkingDirectory not found: $WorkingDirectory" }

if ($StateFile) {
  try {
    $stateDir = Split-Path -Path $StateFile -Parent
    if ($stateDir) { New-Item -ItemType Directory -Force -Path $stateDir | Out-Null }
    if (Test-Path $StateFile) { Remove-Item -Path $StateFile -Force -ErrorAction SilentlyContinue }
  } catch { Write-Output "[SERVE:WARN] Unable to prepare state file '$StateFile': $($_.Exception.Message)" }
}

Push-Location $WorkingDirectory
try {
  # ----- Port selection (find a free one) -----
  if (-not $Port -or $Port -lt 1) { $Port = 8080 }
  while ($true) {
    try {
      $tcp = New-Object System.Net.Sockets.TcpClient
      $tcp.Connect('127.0.0.1', $Port)
      $tcp.Close()
      $Port++
    } catch {
      break  # current $Port is free
    }
  }

  Write-Output "[SERVE] Web root: $WorkingDirectory"
  Write-Output "[SERVE] Port: $Port"

  # ----- Start first available server: HttpListener → Node → Python -----
  function Start-HttpListener {
    try {
      $job = Start-Job -ScriptBlock {
        param($root,$p)
        try { Add-Type -AssemblyName System.Web } catch {}
        $mimeMap = @{
          ".html"="text/html; charset=utf-8"; ".htm"="text/html; charset=utf-8";
          ".js"="text/javascript; charset=utf-8"; ".mjs"="text/javascript; charset=utf-8"; ".cjs"="text/javascript; charset=utf-8";
          ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8";
          ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif";
          ".map"="application/json; charset=utf-8"; ".txt"="text/plain; charset=utf-8"
        }
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://127.0.0.1:$p/")
        $listener.Start()
        try {
          while ($listener.IsListening) {
            try {
              $ctx = $listener.GetContext()
              $rawPath = $ctx.Request.Url.AbsolutePath
              if ([string]::IsNullOrWhiteSpace($rawPath)) { $rawPath = '/' }
              $decoded = [System.Uri]::UnescapeDataString($rawPath)
              $safeRel = $decoded.TrimStart('/') -replace '/','\'
              $candidate = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $safeRel))
              if (-not $candidate.StartsWith([System.IO.Path]::GetFullPath($root))) {
                $ctx.Response.StatusCode = 403
                $ctx.Response.Close()
                continue
              }
              if ([System.IO.Directory]::Exists($candidate)) {
                $candidate = [System.IO.Path]::Combine($candidate,'index.html')
              }
              if (-not [System.IO.File]::Exists($candidate)) {
                $ctx.Response.StatusCode = 404
                $ctx.Response.Close()
                continue
              }
              $bytes = [System.IO.File]::ReadAllBytes($candidate)
              $ext = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
              $resp = $ctx.Response
              $resp.Headers['Cache-Control'] = 'no-store'
              if ($mimeMap.ContainsKey($ext)) {
                $resp.ContentType = $mimeMap[$ext]
              } else {
                $resp.ContentType = 'application/octet-stream'
              }
              $resp.Headers['Content-Type'] = $resp.ContentType
              $resp.ContentLength64 = $bytes.Length
              $resp.OutputStream.Write($bytes,0,$bytes.Length)
              $resp.OutputStream.Flush()
              $resp.Close()
            } catch {}
          }
        } finally {
          try { $listener.Stop() } catch {}
          try { $listener.Close() } catch {}
        }
      } -ArgumentList $WorkingDirectory,$Port
      $script:ServerJob = $job
      return 'HttpListener'
    } catch {
      if ($script:ServerJob) {
        try { Stop-Job -Job $script:ServerJob -ErrorAction SilentlyContinue | Out-Null } catch {}
        $script:ServerJob = $null
      }
      return $null
    }
  }

  function Write-NodeServerScript {
    param([string]$Path)
    $nodeScript = @"
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.argv[2], 10) || 8080;
const root = path.resolve(process.argv[3] || process.cwd());

const mime = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

function safeJoin(rootDir, reqPath) {
  const decoded = decodeURIComponent(reqPath || '/');
  const normalized = path.normalize(decoded).replace(/^\\+/, '').replace(/^\/+/, '');
  const target = path.join(rootDir, normalized);
  if (!target.startsWith(rootDir)) {
    return null;
  }
  return target;
}

const server = http.createServer((req, res) => {
  const joined = safeJoin(root, req.url ? req.url.split('?')[0] : '/');
  if (!joined) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  let filePath = joined;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    try {
      stat = fs.statSync(filePath);
    } catch (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
  }
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const type = mime[ext] ?? 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    res.writeHead(500);
    res.end('Server error');
  }
});

server.listen(port, '127.0.0.1');

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
"@
    Set-Content -Path $Path -Value $nodeScript -Encoding UTF8 -Force
  }

  function Start-Node {
    try {
      $node = Get-Command 'node' -ErrorAction SilentlyContinue
      if (-not $node) { return $null }
      $scriptPath = Join-Path ([System.IO.Path]::GetTempPath()) 'crmtool_dev_server.js'
      Write-NodeServerScript -Path $scriptPath
      Start-Process -FilePath $node.Source -ArgumentList @($scriptPath, "$Port", $WorkingDirectory) -PassThru -WindowStyle Hidden
    } catch { $null }
  }

  function Write-PythonServerScript {
    param([string]$Path)
    $pyScript = @"
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.getcwd())
os.chdir(ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = http.server.SimpleHTTPRequestHandler.extensions_map.copy()
    extensions_map['.js'] = 'application/javascript'
    extensions_map['.cjs'] = 'application/javascript'
    extensions_map['.css'] = 'text/css'
    extensions_map.update({
        '.mjs': 'text/javascript',
        '.map': 'application/json',
    })

    def guess_type(self, path):
        ctype = super().guess_type(path)
        if path.lower().endswith('.js'):
            accept = self.headers.get('Accept', '')
            if 'text/javascript' in accept:
                return 'text/javascript'
        return ctype

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

Handler.extensions_map['.JS'] = Handler.extensions_map['.js']
Handler.extensions_map['.MJS'] = Handler.extensions_map['.mjs']
Handler.extensions_map['.MAP'] = Handler.extensions_map['.map']

with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
"@
    Set-Content -Path $Path -Value $pyScript -Encoding UTF8 -Force
  }

  function Start-PythonExe {
    param([string]$Executable)
    try {
      $cmd = Get-Command $Executable -ErrorAction SilentlyContinue
      if (-not $cmd) { return $null }
      $scriptPath = Join-Path ([System.IO.Path]::GetTempPath()) 'crmtool_dev_server.py'
      Write-PythonServerScript -Path $scriptPath
      Start-Process -FilePath $cmd.Source -ArgumentList @($scriptPath, "$Port", $WorkingDirectory) -PassThru -WindowStyle Hidden
    } catch { $null }
  }

  $which = $null
  $script:ServerProcess = $null
  $serverChoice = Start-HttpListener
  if ($serverChoice) {
    $which = $serverChoice
  } else {
    $script:ServerProcess = Start-Node
    if ($script:ServerProcess) { $which = "node (pid=$($script:ServerProcess.Id))" }
  }
  if (-not $which) {
    $script:ServerProcess = Start-PythonExe -Executable 'python'
    if ($script:ServerProcess) { $which = "python (pid=$($script:ServerProcess.Id))" }
  }
  if (-not $which) {
    $script:ServerProcess = Start-PythonExe -Executable 'py'
    if ($script:ServerProcess) { $which = "py (pid=$($script:ServerProcess.Id))" }
  }
  if (-not $which) {
    throw "No server available (HttpListener/Node/Python failed)"
  }

  Write-Output "[SERVE] Server: $which"

  # ----- Readiness probe -----
  $ready = $false
  for ($i=0; $i -lt 60; $i++) {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -Uri ("http://127.0.0.1:{0}/index.html" -f $Port) -TimeoutSec 2
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) { $ready = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw "Server did not become ready on port $Port" }

  # ----- Open browser (Chrome→Edge→default) -----
  $chrome = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  $edge = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  $url = "http://127.0.0.1:$Port/"

  if ($StateFile) {
    try {
      $state = @{ Port = $Port; Url = $url; Timestamp = (Get-Date).ToString('o') }
      $state | ConvertTo-Json -Depth 3 | Set-Content -Path $StateFile -Encoding UTF8
    } catch { Write-Output "[SERVE:WARN] Unable to write state file '$StateFile': $($_.Exception.Message)" }
  }

  # Build an isolated user-data-dir for a dedicated browser instance
  $RunRoot = Join-Path $env:LOCALAPPDATA "MortgageCRM\browser"
  try { New-Item -ItemType Directory -Force -Path $RunRoot | Out-Null } catch {}
  $UserDataDir = Join-Path $RunRoot ("run-{0}" -f $Port)
  try { New-Item -ItemType Directory -Force -Path $UserDataDir | Out-Null } catch {}

  # Prefer an app window; add no-first-run flags to avoid prompts
  $commonArgs = @(
    "--user-data-dir=`"$UserDataDir`"",
    "--no-first-run",
    "--no-default-browser-check",
    "--app=`"$url`""
  )
  $args = $commonArgs -join ' '

  $p = $null
  try {
    if ($chrome)      { $p = Start-Process -FilePath $chrome -ArgumentList $args -PassThru }
    elseif ($edge)    { $p = Start-Process -FilePath $edge   -ArgumentList $args -PassThru }
    else              { $p = Start-Process -FilePath $url    -PassThru }  # fallback: system default
  } catch {
    Write-Output "[SERVE:WARN] Failed to launch browser: $($_.Exception.Message)"
  }

  Write-Output "[SERVE] Ready at $url"
  Write-Output "[SERVE] Close the CRM window to stop the server."

  # If we got a dedicated browser process, wait for it; otherwise keep the server running
  $launchedAt = Get-Date
  $waited = $false
  if ($p -and $p.Id) {
    try {
      Wait-Process -Id $p.Id
      $waited = $true
    } catch {}
  }

  # --- Graceful shutdown once the app window exits (or if no dedicated process was available)
  if ($waited -eq $false) {
    # We didn't get a dedicated PID (likely default browser route). Keep server alive until the console is closed.
    Write-Output "[SERVE] No dedicated browser PID. Server will continue running. Close this window to stop it."
    try { while ($true) { Start-Sleep -Seconds 1 } } catch {}
  }

  # Stop child servers and jobs
  if ($script:ServerProcess -and ($script:ServerProcess.HasExited -ne $true)) {
    try { Stop-Process -Id $script:ServerProcess.Id -ErrorAction SilentlyContinue } catch {}
  }
  if ($script:ServerJob) {
    try { Stop-Job -Job $script:ServerJob -ErrorAction SilentlyContinue | Out-Null } catch {}
    try { Remove-Job -Job $script:ServerJob -Force -ErrorAction SilentlyContinue | Out-Null } catch {}
  }

} finally {
  # Cleanup to ensure no lingering processes remain
  if ($script:ServerProcess -and ($script:ServerProcess.HasExited -ne $true)) {
    try { Stop-Process -Id $script:ServerProcess.Id -ErrorAction SilentlyContinue } catch { }
  }
  if ($script:ServerJob) {
    try { Stop-Job -Job $script:ServerJob -ErrorAction SilentlyContinue | Out-Null } catch { }
    try { Remove-Job -Job $script:ServerJob -Force -ErrorAction SilentlyContinue | Out-Null } catch { }
  }
  if ($StateFile) {
    try { Remove-Item -Path $StateFile -Force -ErrorAction SilentlyContinue } catch { }
  }
  Pop-Location
}
# IMPORTANT: do NOT call 'exit' in this file. Throw on error; otherwise return to caller.
