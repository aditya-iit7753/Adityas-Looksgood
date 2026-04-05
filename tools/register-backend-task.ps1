$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $root "tools\\start-backend-server.ps1"
$taskName = "LooksGoodBackend"
$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$startScript`""

schtasks /Delete /TN $taskName /F | Out-Null
schtasks /Create /SC ONLOGON /TN $taskName /TR $action /RL LIMITED /F | Out-Null
schtasks /Run /TN $taskName | Out-Null

Write-Host "[task] Created and started task: $taskName"
