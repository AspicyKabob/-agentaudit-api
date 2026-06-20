# Quick check: is the test account still valid or rate-limited?
$API_KEY = $env:AGENTAUDIT_API_KEY
if (-not $API_KEY) {
    throw "Set AGENTAUDIT_API_KEY before running this stress test. Do not commit real API keys."
}
$BASE_URL = if ($env:AGENTAUDIT_BASE_URL) { $env:AGENTAUDIT_BASE_URL } else { "http://localhost:3000/api/v1" }

$body = (@{ action = "ping"; prompt = "test"; response = "ok"; metadata = @{ test = $true } } | ConvertTo-Json -Depth 3 -Compress)

try {
    $r = Invoke-RestMethod -Uri "$BASE_URL/audit-logs" -Method POST -Headers @{
        "X-API-Key" = $API_KEY
        "Content-Type" = "application/json"
    } -Body $body -TimeoutSec 15
    Write-Host "ACCOUNT VALID — id=$($r.id)"
} catch {
    $code = $_.Exception.Response.StatusCode.Value__
    Write-Host "ACCOUNT BLOCKED — HTTP $code"
    Write-Host "Message: $($_.Exception.Message)"
    if ($code -eq 429) {
        Write-Host ""
        Write-Host ">>> This account is rate-limited. Need to create a new test account."
    }
}
