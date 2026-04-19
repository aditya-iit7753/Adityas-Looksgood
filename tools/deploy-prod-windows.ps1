param(
  [Parameter(Mandatory = $true)]
  [string]$Email,

  [string]$Domain = "looksgoods.com",
  [string]$CertName = "",

  [switch]$SkipCert
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not $CertName) { $CertName = $Domain }

function New-RandomSecret([int]$Length = 64) {
  $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
  -join (1..$Length | ForEach-Object { $chars[(Get-Random -Minimum 0 -Maximum $chars.Length)] })
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is not installed or not on PATH. Install Docker Desktop first."
}

$envFile = Join-Path $repoRoot ".env.production"
if (-not (Test-Path $envFile)) {
  Copy-Item -Force (Join-Path $repoRoot ".env.production.example") $envFile

  $postgresPassword = New-RandomSecret 40
  $jwtSecret = New-RandomSecret 64

  $text = Get-Content $envFile -Raw
  $text = $text -replace '(?m)^POSTGRES_PASSWORD=.*$', "POSTGRES_PASSWORD=$postgresPassword"
  $text = $text -replace '(?m)^JWT_SECRET=.*$', "JWT_SECRET=$jwtSecret"
  $text = $text -replace '(?m)^DOMAIN=.*$', "DOMAIN=$Domain"
  $text = $text -replace '(?m)^CERT_NAME=.*$', "CERT_NAME=$CertName"
  $text = $text -replace '(?m)^APP_ENV=.*$', "APP_ENV=production"
  $text = $text -replace '(?m)^PUBLIC_BASE_URL=.*$', "PUBLIC_BASE_URL=https://$Domain"
  $text = $text -replace '(?m)^CORS_ORIGINS=.*$', "CORS_ORIGINS=https://$Domain,https://www.$Domain"

  Set-Content -Path $envFile -Value $text -Encoding utf8

  Write-Host "Created $envFile with generated POSTGRES_PASSWORD and JWT_SECRET."
  Write-Host "Set OPENAI/Cloudinary/Stripe env vars in $envFile if needed before going live."
} else {
  Write-Host "Using existing $envFile"
}

Write-Host "Starting HTTP bootstrap nginx (profile bootstrap)..."
docker compose -f docker-compose.prod.yml --env-file .env.production --profile bootstrap up -d --build

docker compose -f docker-compose.prod.yml --env-file .env.production ps

if ($SkipCert) {
  Write-Host "SkipCert set. Bootstrap mode is running on http://$Domain (port 80)."
  exit 0
}

Write-Host "Issuing Let's Encrypt certificate for $Domain and www.$Domain ..."
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm certbot certonly `
  --webroot -w /var/www/certbot `
  -d $Domain -d ("www.$Domain") --cert-name $CertName `
  --email $Email --agree-tos --no-eff-email

Write-Host "Switching to HTTPS nginx (profile https)..."
docker compose -f docker-compose.prod.yml --env-file .env.production --profile https up -d --build

Write-Host "Stopping bootstrap nginx..."
docker compose -f docker-compose.prod.yml --env-file .env.production stop web_bootstrap

docker compose -f docker-compose.prod.yml --env-file .env.production ps

try {
  $resp = Invoke-WebRequest -Uri 'http://127.0.0.1/api/health' -UseBasicParsing -TimeoutSec 5
  Write-Host "Health (http) status: $($resp.StatusCode)"
} catch {
  Write-Host "Health (http) check failed: $($_.Exception.Message)"
}

