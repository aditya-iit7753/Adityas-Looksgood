param(
  [Parameter(Mandatory = $false)]
  [string]$ApiKey
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  $secure = Read-Host "Paste your OpenAI API key" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $ApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$ApiKey = [string]$ApiKey
if ([string]::IsNullOrWhiteSpace($ApiKey) -or -not $ApiKey.StartsWith("sk-")) {
  throw "Invalid key format. Expected key starting with 'sk-'."
}

$envLocalPath = Join-Path $PSScriptRoot ".env.local"
$content = @(
  "OPENAI_API_KEY=$ApiKey"
  "OPENAI_MODEL=gpt-4o-mini"
)

Set-Content -Path $envLocalPath -Value $content -Encoding UTF8
Write-Host "Saved backend key to $envLocalPath"
