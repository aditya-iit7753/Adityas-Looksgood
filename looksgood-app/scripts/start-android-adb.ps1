param(
  [string]$DeviceSerial = ""
)

$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $appRoot ".."))
$backendDir = Join-Path $projectRoot "backend"
$toolsRoot = Join-Path $projectRoot "tools\\platform-tools-fresh"
$platformTools = Join-Path $toolsRoot "platform-tools"
$adb = Join-Path $platformTools "adb.exe"
$pythonExe = "python"
$backendPort = 8100
$tempDatabasePath = Join-Path $env:TEMP "looksgood.dev.db"

$env:ANDROID_HOME = $toolsRoot
$env:ANDROID_SDK_ROOT = $toolsRoot
$env:PATH = "$platformTools;$env:PATH"

function Test-PythonCandidate {
  param(
    [string]$Candidate
  )

  try {
    & $Candidate --version | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

foreach ($candidate in @(
  "D:\\Looksbook\\backend-venv\\Scripts\\python.exe",
  (Join-Path $backendDir "venv\\Scripts\\python.exe"),
  "python"
)) {
  if ($candidate -eq "python" -or (Test-Path $candidate)) {
    if (Test-PythonCandidate -Candidate $candidate) {
      $pythonExe = $candidate
      break
    }
  }
}

if (-not (Test-Path $adb)) {
  throw "ADB not found at $adb"
}

function Get-LanIpv4Address {
  $rows = ipconfig
  foreach ($row in $rows) {
    if ($row -match "IPv4 Address[^\:]*:\s*(\d+\.\d+\.\d+\.\d+)") {
      $ip = $matches[1]
      if ($ip -notmatch "^127\." -and $ip -notmatch "^169\.254\.") {
        return $ip
      }
    }
  }
  return ""
}

function Test-BackendHealth {
  try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$backendPort/health" -UseBasicParsing -TimeoutSec 3
    return $resp.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Set-LocalApiEnvironment {
  param(
    [string]$LanIp
  )

  $apiUrls = @(
    "http://127.0.0.1:$backendPort",
    "http://localhost:$backendPort",
    "http://10.0.2.2:$backendPort",
    "http://10.0.2.2:$backendPort/api"
  )

  if ($LanIp) {
    $apiUrls += "http://${LanIp}:$backendPort"
    $apiUrls += "http://${LanIp}:$backendPort/api"
  }

  $env:EXPO_PUBLIC_API_URL = "http://127.0.0.1:$backendPort"
  $env:EXPO_PUBLIC_API_URLS = (($apiUrls | Select-Object -Unique) -join ",")
  $sqlitePath = $tempDatabasePath.Replace("\", "/")
  $env:DATABASE_URL = "sqlite:///$sqlitePath"
  $env:PUBLIC_BASE_URL = if ($LanIp) { "http://${LanIp}:$backendPort" } else { "http://127.0.0.1:$backendPort" }
  if ($LanIp) {
    $env:EXPO_PUBLIC_WEB_FRONTEND_URL = "http://${LanIp}:5500/web-frontend/index.html"
  }

  Write-Host "[android:adb] API primary: $($env:EXPO_PUBLIC_API_URL)"
  Write-Host "[android:adb] Dev database: $tempDatabasePath"
  if ($LanIp) {
    Write-Host "[android:adb] API LAN fallback: http://${LanIp}:$backendPort"
  }
}

function Ensure-DevDatabase {
  if (Test-Path $tempDatabasePath) {
    return
  }

  $sourceDb = Join-Path $backendDir "looksgood.db"
  if (-not (Test-Path $sourceDb)) {
    return
  }

  Write-Host "[android:adb] Cloning local DB to $tempDatabasePath"
  $cloneScript = @"
import sqlite3
from pathlib import Path

source_path = Path(r"$sourceDb")
target_path = Path(r"$tempDatabasePath")
target_path.parent.mkdir(parents=True, exist_ok=True)
if target_path.exists():
    target_path.unlink()

source = sqlite3.connect(f"file:{source_path.as_posix()}?mode=ro&immutable=1", uri=True)
target = sqlite3.connect(str(target_path))
source.backup(target)
target.close()
source.close()
"@

  & $pythonExe -c $cloneScript
}

function Restart-Backend {
  if (-not (Test-Path $pythonExe)) {
    throw "Python venv not found at $pythonExe"
  }

  $listeners = Get-NetTCPConnection -State Listen -LocalPort $backendPort -ErrorAction SilentlyContinue
  if ($listeners) {
    $owners = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $owners) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
  }

  Write-Host "[android:adb] Starting backend on :$backendPort"
  Start-Process -FilePath $pythonExe -WorkingDirectory $backendDir -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$backendPort", "--reload") -WindowStyle Hidden | Out-Null

  for ($i = 0; $i -lt 10; $i++) {
    if (Test-BackendHealth) {
      Write-Host "[android:adb] Backend ready at http://127.0.0.1:$backendPort"
      return
    }
    Start-Sleep -Seconds 1
  }

  throw "Backend did not become ready on port $backendPort"
}

function Resolve-DeviceSerial {
  if ($DeviceSerial) {
    return $DeviceSerial
  }

  $serials = @()
  $rows = & $adb devices
  foreach ($row in $rows) {
    if ([string]::IsNullOrWhiteSpace($row)) { continue }
    if ($row -like "List of devices attached*") { continue }
    $parts = $row -split "\s+"
    if ($parts.Length -ge 2 -and $parts[1] -eq "device") {
      $serials += $parts[0]
    }
  }

  if ($serials.Count -gt 0) {
    return $serials[0]
  }

  return ""
}

function Clear-StaleExpoListeners {
  $stalePids = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -ge 8081 -and $_.LocalPort -le 8089 } |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($procId in $stalePids) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

$lanIp = Get-LanIpv4Address
Set-LocalApiEnvironment -LanIp $lanIp
Ensure-DevDatabase
Restart-Backend

& $adb start-server | Out-Null
$resolvedDevice = Resolve-DeviceSerial

if ($resolvedDevice) {
  Write-Host "[android:adb] Using device: $resolvedDevice"
  & $adb -s $resolvedDevice reverse tcp:8081 tcp:8081 | Out-Null
  & $adb -s $resolvedDevice reverse tcp:8100 tcp:8100 | Out-Null
} else {
  Write-Host "[android:adb] No connected device found. Starting Metro only."
}

Clear-StaleExpoListeners
npx expo start --localhost --port 8081 --clear
