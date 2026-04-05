param(
  [int]$Port = 8100
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend"
$pythonExe = "D:\\Looksbook\\backend-venv\\Scripts\\python.exe"
if (-not (Test-Path $pythonExe)) {
  $pythonExe = Join-Path $backendDir "venv\\Scripts\\python.exe"
}
$logDir = Join-Path $root "tools\\logs"
$outLog = Join-Path $logDir "backend.out.log"
$errLog = Join-Path $logDir "backend.err.log"

if (-not (Test-Path $pythonExe)) {
  throw "Backend venv Python not found at $pythonExe"
}

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
if ($listeners) {
  Write-Host "[backend] Port $Port already has a listener; skipping start."
  exit 0
}

Start-Process `
  -FilePath $pythonExe `
  -WorkingDirectory $backendDir `
  -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$Port", "--log-level", "warning") `
  -RedirectStandardOutput $outLog `
  -RedirectStandardError $errLog `
  -WindowStyle Hidden

Write-Host "[backend] Started on port $Port"
