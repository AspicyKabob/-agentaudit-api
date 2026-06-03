# AgentAudit Long Sequential Stress Test
# Stays within production rate limits (100 req / 15 min) for valid measurement
# 5 minutes, ~180 single + ~90 batch = ~270 total requests (well under 100/15min)

$API_KEY = "aa_c766abba38c26507502b3718e9681c8fc847f1197354fb3e1419c18d5f83088e"
$BASE_URL = "https://agentaudit-api-production.up.railway.app/api/v1"
$SINGLE_COUNT = 180
$BATCH_COUNT = 90
$BATCH_SIZE = 50
$DELAY_MS = 500   # ~2 req/sec max to stay well under rate limit

$headers = @{
    "X-API-Key" = $API_KEY
    "Content-Type" = "application/json"
}

function RandomText($len) {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    -join ((1..$len) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

Write-Host "AgentAudit Long Sequential Stress Test"
Write-Host "======================================"
Write-Host "Single: $SINGLE_COUNT | Batch: $BATCH_COUNT x $BATCH_SIZE items"
Write-Host "Delay: ${DELAY_MS}ms between requests"
Write-Host "Target: $BASE_URL"
Write-Host ""

# --- Single requests ---
Write-Host "Phase 1: Single requests ($SINGLE_COUNT x POST /audit-logs)"
$singleTimes = @()
$singleOK = 0; $singleFail = 0
$startPhase1 = Get-Date

for ($i = 1; $i -le $SINGLE_COUNT; $i++) {
    $body = (@{
        action = ("prompt_submitted","llm_response","tool_executed","crewai_task_end","agent_action")[(Get-Random -Maximum 5)]
        prompt = (RandomText (Get-Random -Minimum 30 -Maximum 80))
        response = (RandomText (Get-Random -Minimum 40 -Maximum 120))
        metadata = @{ model = "gpt-4"; tokens = (Get-Random -Minimum 50 -Maximum 500); batch = $false }
    } | ConvertTo-Json -Depth 3 -Compress)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Invoke-RestMethod -Uri "$BASE_URL/audit-logs" -Method POST -Headers $headers -Body $body -TimeoutSec 15 | Out-Null
        $sw.Stop()
        $singleOK++
        $singleTimes += $sw.Elapsed.TotalMilliseconds
    } catch {
        $sw.Stop()
        $singleFail++
        if ($singleFail -le 5) {
            Write-Host "  [$i] FAIL: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    if ($i % 20 -eq 0) {
        $pct = [math]::Round(($i / $SINGLE_COUNT) * 100, 0)
        Write-Host "  [$i/$SINGLE_COUNT] $pct% complete | OK=$singleOK FAIL=$singleFail"
    }

    if ($i -lt $SINGLE_COUNT) { Start-Sleep -Milliseconds $DELAY_MS }
}

$elapsed1 = ((Get-Date) - $startPhase1).TotalSeconds

# --- Batch requests ---
Write-Host ""
Write-Host "Phase 2: Batch requests ($BATCH_COUNT x POST /audit-logs/batch, $BATCH_SIZE entries each)"
$batchTimes = @()
$batchOK = 0; $batchFail = 0
$startPhase2 = Get-Date

for ($i = 1; $i -le $BATCH_COUNT; $i++) {
    $entries = @()
    for ($j = 0; $j -lt $BATCH_SIZE; $j++) {
        $entries += @{
            action = ("prompt_submitted","llm_response","tool_executed","crewai_task_end","agent_action")[(Get-Random -Maximum 5)]
            prompt = (RandomText (Get-Random -Minimum 30 -Maximum 80))
            response = (RandomText (Get-Random -Minimum 40 -Maximum 120))
            metadata = @{ model = "gpt-4"; tokens = (Get-Random -Minimum 50 -Maximum 500); batch = $true }
        }
    }
    $body = ($entries | ConvertTo-Json -Depth 3 -Compress)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Invoke-RestMethod -Uri "$BASE_URL/audit-logs/batch" -Method POST -Headers $headers -Body $body -TimeoutSec 15 | Out-Null
        $sw.Stop()
        $batchOK++
        $batchTimes += $sw.Elapsed.TotalMilliseconds
    } catch {
        $sw.Stop()
        $batchFail++
        if ($batchFail -le 5) {
            Write-Host "  [$i] FAIL: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    if ($i % 15 -eq 0) {
        $pct = [math]::Round(($i / $BATCH_COUNT) * 100, 0)
        Write-Host "  [$i/$BATCH_COUNT] $pct% complete | OK=$batchOK FAIL=$batchFail"
    }

    if ($i -lt $BATCH_COUNT) { Start-Sleep -Milliseconds $DELAY_MS }
}

$elapsed2 = ((Get-Date) - $startPhase2).TotalSeconds
$totalElapsed = ((Get-Date) - $startPhase1).TotalSeconds

# ===================== REPORT =====================
function Percentile($data, $p) {
    if ($data.Count -eq 0) { return 0 }
    $sorted = $data | Sort-Object
    $idx = [math]::Min([math]::Floor($sorted.Count * $p), $sorted.Count - 1)
    return $sorted[$idx]
}

Write-Host ""
Write-Host "=============================================="
Write-Host "     AgentAudit Stress Test Report"
Write-Host "=============================================="
Write-Host "  Total Duration (sec)  $([math]::Round($totalElapsed,1))"
Write-Host ""
Write-Host "  SINGLE POST /audit-logs"
Write-Host "  ------------------------------"
$singleTotal = $singleOK + $singleFail
Write-Host "  Requests              $singleTotal"
Write-Host "  Success               $singleOK"
Write-Host "  Failures              $singleFail"
Write-Host "  Phase Duration        $([math]::Round($elapsed1,1)) sec"
if ($singleTimes.Count -gt 0) {
    $sAvg = ($singleTimes | Measure-Object -Average).Average
    $sMin = ($singleTimes | Measure-Object -Minimum).Minimum
    $sMax = ($singleTimes | Measure-Object -Maximum).Maximum
    Write-Host "  Latency Avg           $([math]::Round($sAvg,1)) ms"
    Write-Host "  Latency Min           $([math]::Round($sMin,1)) ms"
    Write-Host "  Latency Max           $([math]::Round($sMax,1)) ms"
    Write-Host "  Latency P50           $([math]::Round((Percentile $singleTimes 0.50),1)) ms"
    Write-Host "  Latency P95           $([math]::Round((Percentile $singleTimes 0.95),1)) ms"
    Write-Host "  Latency P99           $([math]::Round((Percentile $singleTimes 0.99),1)) ms"
    $singleRate = [math]::Round($singleTotal / $elapsed1, 1)
    Write-Host "  Throughput            $singleRate req/sec"
}

Write-Host ""
Write-Host "  BATCH POST /audit-logs/batch ($BATCH_SIZE entries)"
Write-Host "  ------------------------------"
$batchTotal = $batchOK + $batchFail
$itemsProcessed = $batchOK * $BATCH_SIZE
Write-Host "  Requests              $batchTotal"
Write-Host "  Success               $batchOK"
Write-Host "  Failures              $batchFail"
Write-Host "  Items Processed       $itemsProcessed"
Write-Host "  Phase Duration        $([math]::Round($elapsed2,1)) sec"
if ($batchTimes.Count -gt 0) {
    $bAvg = ($batchTimes | Measure-Object -Average).Average
    $bMin = ($batchTimes | Measure-Object -Minimum).Minimum
    $bMax = ($batchTimes | Measure-Object -Maximum).Maximum
    Write-Host "  Latency Avg           $([math]::Round($bAvg,1)) ms"
    Write-Host "  Latency Min           $([math]::Round($bMin,1)) ms"
    Write-Host "  Latency Max           $([math]::Round($bMax,1)) ms"
    Write-Host "  Latency P50           $([math]::Round((Percentile $batchTimes 0.50),1)) ms"
    Write-Host "  Latency P95           $([math]::Round((Percentile $batchTimes 0.95),1)) ms"
    Write-Host "  Latency P99           $([math]::Round((Percentile $batchTimes 0.99),1)) ms"
    $batchRate = [math]::Round($batchTotal / $elapsed2, 1)
    $itemRate = [math]::Round($itemsProcessed / $elapsed2, 0)
    Write-Host "  Throughput            $batchRate req/sec"
    Write-Host "  Effective Item Rate   $itemRate items/sec"
}

Write-Host ""
Write-Host "  COMBINED"
Write-Host "  ------------------------------"
$totalReqs = $singleTotal + $batchTotal
$totalItems = $singleTotal + $itemsProcessed
Write-Host "  Total Requests        $totalReqs"
Write-Host "  Total Items Logged    $totalItems"
Write-Host "  Overall Item Rate     $([math]::Round($totalItems / $totalElapsed, 0)) items/sec"
Write-Host "  Success Rate          $([math]::Round((($singleOK + $batchOK) / $totalReqs) * 100, 1))%"
Write-Host "=============================================="
