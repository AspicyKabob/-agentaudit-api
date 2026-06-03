# Quick check: is the test account still valid or rate-limited?
$API_KEY = "aa_c766abba38c26507502b3718e9681c8fc847f1197354fb3e1419c18d5f83088e"
$BASE_URL = "https://agentaudit-api-production.up.railway.app/api/v1"

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
