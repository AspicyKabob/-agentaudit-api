# AgentAudit Concurrent Production Stress Test
# PowerShell 5.1 compatible using RunspacePool for true parallelism
# Mimics scripts/stress_test.py behavior: 60s duration, 8 workers, batch size 50

$API_KEY = "aa_c766abba38c26507502b3718e9681c8fc847f1197354fb3e1419c18d5f83088e"
$BASE_URL = "https://agentaudit-api-production.up.railway.app/api/v1"
$DURATION = 60
$WORKERS = 8
$BATCH_SIZE = 50

# Thread-safe result collections
$singleTimes = [System.Collections.ArrayList]::Synchronized([System.Collections.ArrayList]::new())
$batchTimes  = [System.Collections.ArrayList]::Synchronized([System.Collections.ArrayList]::new())
$singleOK = [System.Collections.ArrayList]::Synchronized([System.Collections.ArrayList]::new())
$singleFail = [System.Collections.ArrayList]::Synchronized([System.Collections.ArrayList]::new())
$batchOK = [System.Collections.ArrayList]::Synchronized([System.Collections.ArrayList]::new())
$batchFail = [System.Collections.ArrayList]::Synchronized([System.Collections.ArrayList]::new())

# Shared stop signal
$stopTime = (Get-Date).AddSeconds($DURATION)

function RandomText($len) {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    -join ((1..$len) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

function Invoke-SingleWorker {
    param($BaseUrl, $ApiKey, $StopTime, $TimesRef, $OKRef, $FailRef)
    $client = New-Object System.Net.WebClient
    $client.Headers.Add("X-API-Key", $ApiKey)
    $client.Headers.Add("Content-Type", "application/json")
    $actions = @("prompt_submitted","llm_response","tool_executed","crewai_task_end","agent_action")
    while ((Get-Date) -lt $StopTime) {
        $body = (@{
            action = $actions[(Get-Random -Maximum $actions.Length)]
            prompt = (RandomText (Get-Random -Minimum 30 -Maximum 80))
            response = (RandomText (Get-Random -Minimum 40 -Maximum 120))
            metadata = @{ model = "gpt-4"; tokens = (Get-Random -Minimum 50 -Maximum 500); worker = "single" }
        } | ConvertTo-Json -Depth 3 -Compress)

        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $client.UploadString("$BaseUrl/audit-logs", "POST", $body) | Out-Null
            $sw.Stop()
            [void]$TimesRef.Add($sw.Elapsed.TotalMilliseconds)
            [void]$OKRef.Add(1)
        } catch {
            $sw.Stop()
            [void]$FailRef.Add(1)
        }
    }
}

function Invoke-BatchWorker {
    param($BaseUrl, $ApiKey, $StopTime, $BatchSize, $TimesRef, $OKRef, $FailRef)
    $client = New-Object System.Net.WebClient
    $client.Headers.Add("X-API-Key", $ApiKey)
    $client.Headers.Add("Content-Type", "application/json")
    $actions = @("prompt_submitted","llm_response","tool_executed","crewai_task_end","agent_action")
    while ((Get-Date) -lt $StopTime) {
        $entries = @()
        for ($j = 0; $j -lt $BatchSize; $j++) {
            $entries += @{
                action = $actions[(Get-Random -Maximum $actions.Length)]
                prompt = (RandomText (Get-Random -Minimum 30 -Maximum 80))
                response = (RandomText (Get-Random -Minimum 40 -Maximum 120))
                metadata = @{ model = "gpt-4"; tokens = (Get-Random -Minimum 50 -Maximum 500); worker = "batch" }
            }
        }
        $body = ($entries | ConvertTo-Json -Depth 3 -Compress)

        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            $client.UploadString("$BaseUrl/audit-logs/batch", "POST", $body) | Out-Null
            $sw.Stop()
            [void]$TimesRef.Add($sw.Elapsed.TotalMilliseconds)
            [void]$OKRef.Add(1)
        } catch {
            $sw.Stop()
            [void]$FailRef.Add(1)
        }
    }
}

Write-Host "AgentAudit Concurrent Stress Test"
Write-Host "================================="
Write-Host "Duration: $DURATION sec | Workers: $WORKERS | Batch Size: $BATCH_SIZE"
Write-Host "Target:   $BASE_URL"
Write-Host ""

$runspacePool = [runspacefactory]::CreateRunspacePool(1, $WORKERS)
$runspacePool.Open()

$runspaces = @()

# Launch single workers
for ($i = 0; $i -lt ($WORKERS / 2); $i++) {
    $powershell = [powershell]::Create().AddScript(${function:Invoke-SingleWorker}).AddArgument($BASE_URL).AddArgument($API_KEY).AddArgument($stopTime).AddArgument($singleTimes).AddArgument($singleOK).AddArgument($singleFail)
    $powershell.RunspacePool = $runspacePool
    $runspaces += @{ Pipe = $powershell; Status = $powershell.BeginInvoke() }
}

# Launch batch workers
for ($i = 0; $i -lt ($WORKERS / 2); $i++) {
    $powershell = [powershell]::Create().AddScript(${function:Invoke-BatchWorker}).AddArgument($BASE_URL).AddArgument($API_KEY).AddArgument($stopTime).AddArgument($BATCH_SIZE).AddArgument($batchTimes).AddArgument($batchOK).AddArgument($batchFail)
    $powershell.RunspacePool = $runspacePool
    $runspaces += @{ Pipe = $powershell; Status = $powershell.BeginInvoke() }
}

# Wait for all workers to complete
Write-Host "Workers running... waiting $DURATION seconds"
$start = Get-Date
$lastReport = $start
while ((Get-Date) -lt $stopTime.AddSeconds(2)) {
    Start-Sleep -Milliseconds 500
    $elapsed = ((Get-Date) - $start).TotalSeconds
    if ($elapsed -ge 5 -and ((Get-Date) - $lastReport).TotalSeconds -ge 5) {
        $sOK = $singleOK.Count
        $bOK = $batchOK.Count
        Write-Host "  [t=$([math]::Round($elapsed,0))s] single=$sOK batch=$bOK" -NoNewline
        Write-Host ""
        $lastReport = Get-Date
    }
}

foreach ($rs in $runspaces) {
    $rs.Pipe.EndInvoke($rs.Status) | Out-Null
    $rs.Pipe.Dispose()
}
$runspacePool.Close()
$runspacePool.Dispose()

$elapsed = ((Get-Date) - $start).TotalSeconds

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
Write-Host "  Duration (sec)        $([math]::Round($elapsed,2))"
Write-Host ""
Write-Host "  SINGLE POST /audit-logs"
Write-Host "  ------------------------------"
$singleTotal = $singleOK.Count + $singleFail.Count
Write-Host "  Requests              $singleTotal"
Write-Host "  Success               $($singleOK.Count)"
Write-Host "  Failures              $($singleFail.Count)"
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
    $singleRate = [math]::Round($singleTotal / $elapsed, 1)
    Write-Host "  Throughput            $singleRate req/sec"
}

Write-Host ""
Write-Host "  BATCH POST /audit-logs/batch ($BATCH_SIZE entries)"
Write-Host "  ------------------------------"
$batchTotal = $batchOK.Count + $batchFail.Count
$itemsProcessed = $batchOK.Count * $BATCH_SIZE
Write-Host "  Requests              $batchTotal"
Write-Host "  Success               $($batchOK.Count)"
Write-Host "  Failures              $($batchFail.Count)"
Write-Host "  Items Processed       $itemsProcessed"
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
    $batchRate = [math]::Round($batchTotal / $elapsed, 1)
    $itemRate = [math]::Round($itemsProcessed / $elapsed, 0)
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
Write-Host "  Overall Rate          $([math]::Round($totalItems / $elapsed, 0)) items/sec"
Write-Host "=============================================="
