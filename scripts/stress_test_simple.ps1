# Simple AgentAudit stress test — sequential with timing
# PowerShell 5.1 compatible, no jobs needed

$API_KEY = "aa_c766abba38c26507502b3718e9681c8fc847f1197354fb3e1419c18d5f83088e"
$BASE_URL = "https://agentaudit-api-production.up.railway.app/api/v1"
$SINGLE_COUNT = 20
$BATCH_COUNT = 10
$BATCH_SIZE = 20

$headers = @{
    "X-API-Key" = $API_KEY
    "Content-Type" = "application/json"
}

function RandomText($len) {
    $chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    -join ((1..$len) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

Write-Host "AgentAudit Production Stress Test"
Write-Host "================================="
Write-Host ""

# --- Single requests ---
Write-Host "Single requests ($SINGLE_COUNT x POST /audit-logs)"
$singleTimes = @()
$singleOK = 0; $singleFail = 0
for ($i = 1; $i -le $SINGLE_COUNT; $i++) {
    $body = (@{
        action = ("prompt_submitted","llm_response","tool_executed")[(Get-Random -Maximum 3)]
        prompt = (RandomText 50)
        response = (RandomText 80)
        metadata = @{ model = "gpt-4"; tokens = (Get-Random -Minimum 50 -Maximum 500) }
    } | ConvertTo-Json -Depth 3 -Compress)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Invoke-RestMethod -Uri "$BASE_URL/audit-logs" -Method POST -Headers $headers -Body $body -TimeoutSec 15 | Out-Null
        $sw.Stop()
        $singleOK++
        $singleTimes += $sw.Elapsed.TotalMilliseconds
        Write-Host "  [$i/$SINGLE_COUNT] OK  $($sw.Elapsed.TotalMilliseconds.ToString('0.0')) ms" -NoNewline; Write-Host ""
    } catch {
        $sw.Stop()
        $singleFail++
        Write-Host "  [$i/$SINGLE_COUNT] FAIL $($_.Exception.Message)" -ForegroundColor Red
    }
}

# --- Batch requests ---
Write-Host ""
Write-Host "Batch requests ($BATCH_COUNT x POST /audit-logs/batch, $BATCH_SIZE entries each)"
$batchTimes = @()
$batchOK = 0; $batchFail = 0
for ($i = 1; $i -le $BATCH_COUNT; $i++) {
    $entries = @()
    for ($j = 0; $j -lt $BATCH_SIZE; $j++) {
        $entries += @{
            action = ("prompt_submitted","llm_response","tool_executed")[(Get-Random -Maximum 3)]
            prompt = (RandomText 50)
            response = (RandomText 80)
            metadata = @{ model = "gpt-4"; tokens = (Get-Random -Minimum 50 -Maximum 500) }
        }
    }
    $body = ($entries | ConvertTo-Json -Depth 3 -Compress)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Invoke-RestMethod -Uri "$BASE_URL/audit-logs/batch" -Method POST -Headers $headers -Body $body -TimeoutSec 15 | Out-Null
        $sw.Stop()
        $batchOK++
        $batchTimes += $sw.Elapsed.TotalMilliseconds
        Write-Host "  [$i/$BATCH_COUNT] OK  $($sw.Elapsed.TotalMilliseconds.ToString('0.0')) ms ($BATCH_SIZE items)" -NoNewline; Write-Host ""
    } catch {
        $sw.Stop()
        $batchFail++
        Write-Host "  [$i/$BATCH_COUNT] FAIL $($_.Exception.Message)" -ForegroundColor Red
    }
}

# --- Report ---
Write-Host ""
Write-Host "========================================"
Write-Host "  AgentAudit Stress Test Report"
Write-Host "========================================"

$singleTotal = $singleOK + $singleFail
Write-Host "  Single Requests              $singleTotal"
Write-Host "  Single Success               $singleOK"
Write-Host "  Single Failures              $singleFail"
if ($singleTimes.Count -gt 0) {
    $sorted = $singleTimes | Sort-Object
    $avg = ($singleTimes | Measure-Object -Average).Average
    $p95 = $sorted[[math]::Min([math]::Floor($sorted.Count * 0.95), $sorted.Count - 1)]
    $p99 = $sorted[[math]::Min([math]::Floor($sorted.Count * 0.99), $sorted.Count - 1)]
    Write-Host "  Single Avg Latency           $([math]::Round($avg,1)) ms"
    Write-Host "  Single P95 Latency           $([math]::Round($p95,1)) ms"
    Write-Host "  Single P99 Latency           $([math]::Round($p99,1)) ms"
}

$batchTotal = $batchOK + $batchFail
$itemsProcessed = $batchOK * $BATCH_SIZE
Write-Host ""
Write-Host "  Batch Requests               $batchTotal"
Write-Host "  Batch Success                $batchOK"
Write-Host "  Batch Failures               $batchFail"
Write-Host "  Items Processed              $itemsProcessed"
if ($batchTimes.Count -gt 0) {
    $sorted = $batchTimes | Sort-Object
    $avg = ($batchTimes | Measure-Object -Average).Average
    $p95 = $sorted[[math]::Min([math]::Floor($sorted.Count * 0.95), $sorted.Count - 1)]
    $p99 = $sorted[[math]::Min([math]::Floor($sorted.Count * 0.99), $sorted.Count - 1)]
    Write-Host "  Batch Avg Latency            $([math]::Round($avg,1)) ms"
    Write-Host "  Batch P95 Latency            $([math]::Round($p95,1)) ms"
    Write-Host "  Batch P99 Latency            $([math]::Round($p99,1)) ms"
    $throughput = [math]::Round($itemsProcessed / (($batchTimes | Measure-Object -Sum).Sum / 1000), 0)
    Write-Host "  Effective Throughput         ~$throughput items/sec"
}
Write-Host "========================================"
