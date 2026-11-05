# ============================================================
#  Stop everything the launcher started:
#    powershell -ExecutionPolicy Bypass -File stop-pulse.ps1
# ============================================================
Write-Host "== Stopping Pulse ==" -ForegroundColor Cyan

$stopped = 0

Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -match "uvicorn|main\.py" } |
    ForEach-Object {
        Write-Host " stopping python ($($_.ProcessId))"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        $stopped++
    }

Get-Process ngrok -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host " stopping ngrok ($($_.Id))"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    $stopped++
}

# Anything still bound to the API port?
$listener = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
if ($listener) {
    Write-Host "[warn] something is still listening on :8000 (pid $($listener.OwningProcess))" -ForegroundColor Yellow
}

if ($stopped -eq 0) {
    Write-Host " nothing was running"
} else {
    Write-Host "[OK] Pulse stopped ($stopped process(es))" -ForegroundColor Green
}
