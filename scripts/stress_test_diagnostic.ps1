# Diagnostic: test one concurrent request with error capture
$API_KEY = $env:AGENTAUDIT_API_KEY
if (-not $API_KEY) {
    throw "Set AGENTAUDIT_API_KEY before running this stress test. Do not commit real API keys."
}
$BASE_URL = if ($env:AGENTAUDIT_BASE_URL) { $env:AGENTAUDIT_BASE_URL } else { "http://localhost:3000/api/v1" }

$body = (@{
    action = "prompt_submitted"
    prompt = "test"
    response = "test response"
    metadata = @{ model = "gpt-4" }
} | ConvertTo-Json -Depth 3 -Compress)

$client = New-Object System.Net.WebClient
$client.Headers.Add("X-API-Key", $API_KEY)
$client.Headers.Add("Content-Type", "application/json")

try {
    $response = $client.UploadString("$BASE_URL/audit-logs", "POST", $body)
    Write-Host "WebClient SUCCESS: $response"
} catch {
    Write-Host "WebClient FAILED: $($_.Exception.GetType().FullName)"
    Write-Host "Message: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $errorBody = $reader.ReadToEnd()
        Write-Host "Response Body: $errorBody"
    }
}

Write-Host ""
Write-Host "Now testing Invoke-RestMethod..."
try {
    $r = Invoke-RestMethod -Uri "$BASE_URL/audit-logs" -Method POST -Headers @{
        "X-API-Key" = $API_KEY
        "Content-Type" = "application/json"
    } -Body $body -TimeoutSec 15
    Write-Host "IRM SUCCESS: id=$($r.id)"
} catch {
    Write-Host "IRM FAILED: $($_.Exception.Message)"
}
