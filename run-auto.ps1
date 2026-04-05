param(
  [switch]$SkipBackend,
  [switch]$SkipExpo,
  [switch]$SkipAdbReverse
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$appDir = Join-Path $root "looksgood-app"
$pythonExe = "D:\\Looksbook\\backend-venv\\Scripts\\python.exe"
if (-not (Test-Path $pythonExe)) {
  $pythonExe = Join-Path $backendDir "venv\\Scripts\\python.exe"
}
$preferredAdb = Join-Path $root "tools\\platform-tools-fresh\\platform-tools\\adb.exe"
$backendPort = 8100

function Invoke-ExternalWithTimeout {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [int]$TimeoutSeconds = 8
  )

  $outFile = Join-Path $env:TEMP ("looksgood_auto_" + [guid]::NewGuid().ToString() + ".out")
  $errFile = Join-Path $env:TEMP ("looksgood_auto_" + [guid]::NewGuid().ToString() + ".err")

  try {
    $p = Start-Process -FilePath $FilePath -ArgumentList $Arguments -PassThru -NoNewWindow -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if ($p.WaitForExit($TimeoutSeconds * 1000)) {
      return @{
        TimedOut = $false
        ExitCode = $p.ExitCode
        StdOut = (Get-Content $outFile -Raw -ErrorAction SilentlyContinue)
        StdErr = (Get-Content $errFile -Raw -ErrorAction SilentlyContinue)
      }
    }

    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    return @{
      TimedOut = $true
      ExitCode = -1
      StdOut = ""
      StdErr = "Timed out after $TimeoutSeconds seconds"
    }
  } catch {
    return @{
      TimedOut = $false
      ExitCode = -1
      StdOut = ""
      StdErr = $_.Exception.Message
    }
  } finally {
    Remove-Item $outFile, $errFile -Force -ErrorAction SilentlyContinue
  }
}

function Test-BackendRoute {
  param(
    [string]$Url,
    [string]$ContainsText = ""
  )

  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 4
    if ($resp.StatusCode -ne 200) {
      return $false
    }
    if ([string]::IsNullOrWhiteSpace($ContainsText)) {
      return $true
    }
    return [string]$resp.Content -like "*$ContainsText*"
  } catch {
    return $false
  }
}

function Start-BackendIfNeeded {
  $backendListener = Get-NetTCPConnection -State Listen -LocalPort $backendPort -ErrorAction SilentlyContinue
  if ($backendListener) {
    $hasLatestRoutes = Test-BackendRoute -Url "http://127.0.0.1:$backendPort/openapi.json" -ContainsText '"/social/settings"'
    if ($hasLatestRoutes) {
      Write-Host "[auto] Backend already running on :$backendPort"
      return
    }

    Write-Host "[auto] Detected stale backend on :$backendPort, attempting restart"
    $owners = $backendListener | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $owners) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
  }

  if (-not (Test-Path $pythonExe)) {
    throw "Python venv not found at $pythonExe"
  }

  Write-Host "[auto] Starting backend on :$backendPort"
  Start-Process -FilePath $pythonExe -WorkingDirectory $backendDir -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "$backendPort", "--reload") -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 2

  if (Test-BackendRoute -Url "http://127.0.0.1:$backendPort/") {
    Write-Host "[auto] Backend ready at http://127.0.0.1:$backendPort"
  } else {
    Write-Host "[auto] Backend started, still warming up..."
  }
}

function Clear-StaleExpoListeners {
  $stalePids = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -ge 8081 -and $_.LocalPort -le 8089 } |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($procId in $stalePids) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  }
}

function Try-SetupAdbReverse {
  $adbCmd = if (Test-Path $preferredAdb) { $preferredAdb } else { "adb" }
  Write-Host "[auto] Trying ADB reverse setup..."

  $startServer = Invoke-ExternalWithTimeout -FilePath $adbCmd -Arguments @("start-server") -TimeoutSeconds 8
  if ($startServer.TimedOut -or $startServer.ExitCode -ne 0) {
    Write-Host "[auto] Skipping ADB reverse (ADB unavailable)."
    return
  }

  $reversePorts = @(
    @("reverse", "tcp:8081", "tcp:8081"),
    @("reverse", "tcp:8100", "tcp:8100")
  )

  foreach ($cmd in $reversePorts) {
    [void](Invoke-ExternalWithTimeout -FilePath $adbCmd -Arguments $cmd -TimeoutSeconds 6)
  }

  Write-Host "[auto] ADB reverse attempted for 8081, 8100"
}

if (-not $SkipBackend) {
  Start-BackendIfNeeded
}

Clear-StaleExpoListeners

if (-not $SkipAdbReverse) {
  Try-SetupAdbReverse
}

if (-not $SkipExpo) {
  Write-Host "[auto] Starting Expo"
  Push-Location $appDir
  try {
    & cmd.exe /c "npm run start"
  } finally {
    Pop-Location
  }
}
