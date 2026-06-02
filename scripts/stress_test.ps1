# AgentAudit Stress Test (PowerShell)
# Mimics scripts/stress_test.py behavior

$API_KEY = "aa_c766abba38c26507502b3718e9681c8fc847f1197354fb3e1419c18d5f83088e"
$BASE_URL = "https://agentaudit-api-production.up.railway.app/api/v1"
$DURATION = 10
$WORKERS = 4
$BATCH_SIZE = 20

$singleTimes = [System.Collections.ArrayList]::new()
$batchTimes = [System.Collections.ArrayList]::new()
$singleOK = 0; $singleFail = 0
$batchOK = 0; $batchFail = 0

function RandomText($len) {
    $chars = "abcdefghijklmnopqrstuvwxyz0123456789"
    -join ((1..$len) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

function SinglePayload() {
    $actions = @("prompt_submitted","llm_response","tool_executed")
    return @{
        action = $actions[(Get-Random -Maximum $actions.Length)]
        prompt = (RandomText 50)
        response = (RandomText 80)
        metadata = @{ model = "gpt-4"; tokens = (Get-Random -Minimum 50 -Maximum 500) }
    } | ConvertTo-Json -Depth 3 -Compress
}

function BatchPayload($size) {
    $entries = @()
    for ($i=0; $i -lt $size; $i++) {
        $actions = @("prompt_submitted","llm_response","tool_executed")
        $entries += @{
            action = $actions[(Get-Random -Maximum $actions.Length)]
            prompt = (RandomText 50)
            response = (RandomText 80)
            metadata = @{ model = "gpt-4"; tokens = (Get-Random -Minimum 50 -Maximum 500) }
        }
    }
    return ($entries | ConvertTo-Json -Depth 3 -Compress)
}

function Measure-Single() {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $body = SinglePayload
        Invoke-RestMethod -Uri "$BASE_URL/audit-logs" -Method POST -Headers @{
            "X-API-Key" = $API_KEY
            "Content-Type" = "application/json"
        } -Body $body -TimeoutSec 15 | Out-Null
        $sw.Stop()
        $script:singleOK++
        [void]$script:singleTimes.Add($sw.Elapsed.TotalSeconds)
    } catch {
        $sw.Stop()
        $script:singleFail++
    }
}

function Measure-Batch($size) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $body = BatchPayload $size
        Invoke-RestMethod -Uri "$BASE_URL/audit-logs/batch" -Method POST -Headers @{
            "X-API-Key" = $API_KEY
            "Content-Type" = "application/json"
        } -Body $body -TimeoutSec 15 | Out-Null
        $sw.Stop()
        $script:batchOK++
        [void]$script:batchTimes.Add($sw.Elapsed.TotalSeconds)
    } catch {
        $sw.Stop()
        $script:batchFail++
    }
}

Write-Host "Starting stress test: $WORKERS workers, $DURATION sec, batch size $BATCH_SIZE"
$start = Get-Date

$runners = @()
for ($i=0; $i -lt ($WORKERS/2); $i++) {
    $runners += Start-Job -ScriptBlock {
        param($d,$fn)
        $end = (Get-Date).AddSeconds($d)
        while ((Get-Date) -lt $end) { & $fn }
    } -ArgumentList $DURATION, ${function:Measure-Single}
}
for ($i=0; $i -lt ($WORKERS/2); $i++) {
    $runners += Start-Job -ScriptBlock {
        param($d,$fn,$bs)
        $end = (Get-Date).AddSeconds($d)
        while ((Get-Date) -lt $end) { & $fn $bs }
    } -ArgumentList $DURATION, ${function:Measure-Batch}, $BATCH_SIZE
}

$runners | Wait-Job | Out-Null
$runners | Remove-Job

$elapsed = ((Get-Date) - $start).TotalSeconds

Write-Host ""
Write-Host "========================================"
Write-Host "  AgentAudit Stress Test Report"
Write-Host "========================================"
Write-Host "  Duration Sec                 $([math]::Round($elapsed,2))"
Write-Host "  Single Success               $singleOK"
Write-Host "  Single Failures              $singleFail"
if ($singleTimes.Count -gt 0) {
    $avg = ($singleTimes | Measure-Object -Average).Average
    $sorted = $singleTimes | Sort-Object
    $p95 = $sorted[[math]::Floor($sorted.Count * 0.95)]
    $p99 = $sorted[[math]::Floor($sorted.Count * 0.99)]
    Write-Host "  Single Latency Avg Ms        $([math]::Round($avg*1000,2))"
    Write-Host "  Single Latency P95 Ms        $([math]::Round($p95*1000,2))"
    Write-Host "  Single Latency P99 Ms        $([math]::Round($p99*1000,2))"
}
Write-Host "  Batch Success                $batchOK"
Write-Host "  Batch Failures               $batchFail"
if ($batchTimes.Count -gt 0) {
    $avg = ($batchTimes | Measure-Object -Average).Average
    $sorted = $batchTimes | Sort-Object
    $p95 = $sorted[[math]::Floor($sorted.Count * 0.95)]
    $p99 = $sorted[[math]::Floor($sorted.Count * 0.99)]
    Write-Host "  Batch Latency Avg Ms         $([math]::Round($avg*1000,2))"
    Write-Host "  Batch Latency P95 Ms         $([math]::Round($p95*1000,2))"
    Write-Host "  Batch Latency P99 Ms         $([math]::Round($p99*1000,2))"
}
Write-Host "========================================"
