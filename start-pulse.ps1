# ============================================================
#  Pulse launcher - starts API + ngrok tunnel + bot.
#  Run:  powershell -ExecutionPolicy Bypass -File start-pulse.ps1
#  (or right-click -> Run with PowerShell)
#  The window stays open at the end - errors remain visible.
# ============================================================
param([switch]$Auto)

$ErrorActionPreference = "Continue"
$root    = "D:\Clinic_BOT"
$backend = "$root\backend"
$ngrok   = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\ngrok.exe"

function Pause-End {
    if (-not $Auto) {
        Write-Host ""
        Read-Host "Press Enter to close this window"
    }
}

function Read-DotEnvValue([string]$path, [string]$key) {
    if (-not (Test-Path $path)) { return $null }
    $match = Select-String -Path $path -Pattern "^\s*$key=(.*)$" | Select-Object -First 1
    if ($match) { return $match.Matches[0].Groups[1].Value.Trim() }
    return $null
}

function Set-DotEnvValue([string]$path, [string]$key, [string]$value) {
    $text = [System.IO.File]::ReadAllText($path)
    $pattern = "(?m)^\s*$key=.*$"
    if ([regex]::IsMatch($text, $pattern)) {
        $text = [regex]::Replace($text, $pattern, "$key=$value")
    } else {
        $text = $text.TrimEnd() + "`r`n$key=$value`r`n"
    }
    [System.IO.File]::WriteAllText($path, $text)
}

try {
    Write-Host "== Pulse launcher ==" -ForegroundColor Cyan

    # --- 0. py launcher check ---
    $py = (Get-Command py -ErrorAction SilentlyContinue).Source
    if (-not $py) { $py = (Get-Command python -ErrorAction SilentlyContinue).Source }
    if (-not $py) { throw "Python launcher not found (py / python). Install Python 3." }
    Write-Host "[..] Python: $py"

    # --- 1. one bot everywhere ---
    # The backend must validate initData with the SAME token the Mini App is
    # opened by, or signed requests fail with 401.
    $rootToken    = Read-DotEnvValue "$root\.env"    "TELEGRAM_TOKEN"
    $backendToken = Read-DotEnvValue "$backend\.env" "PULSE_BOT_TOKEN"
    if (-not $rootToken) {
        Write-Host "[warn] TELEGRAM_TOKEN missing in .env - the t.me link will be skipped" -ForegroundColor Yellow
    } elseif ($rootToken -ne $backendToken) {
        Set-DotEnvValue "$backend\.env" "PULSE_BOT_TOKEN" $rootToken
        Write-Host "[FIX] backend\.env PULSE_BOT_TOKEN synced to the launch bot (was a different bot)" -ForegroundColor Yellow
    }

    # --- 2. stop leftovers ---
    Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
        Where-Object { $_.CommandLine -match "uvicorn|main\.py" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 1

    # --- 3. API ---
    Start-Process -FilePath "$backend\.venv\Scripts\python.exe" `
        -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory $backend -WindowStyle Minimized

    $apiOk = $false
    for ($i = 0; $i -lt 30 -and -not $apiOk; $i++) {
        try {
            $health = Invoke-RestMethod "http://127.0.0.1:8000/api/health" -TimeoutSec 2
            $apiOk = ($health.status -eq "ok")
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $apiOk) { throw "API did not start on :8000 (check backend\.venv)" }
    Write-Host "[OK] API on :8000" -ForegroundColor Green

    # --- 4. ngrok tunnel (up to ~90 s handshake) ---
    if (-not (Test-Path $ngrok)) { throw "ngrok.exe not found at $ngrok" }
    $alreadyRunning = $false
    try {
        $existing = Invoke-RestMethod "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
        if ($existing.tunnels) { $alreadyRunning = $true; Write-Host "[..] reusing live ngrok" }
    } catch { }

    if (-not $alreadyRunning) {
        Start-Process -FilePath $ngrok -ArgumentList "http", "8000" -WindowStyle Minimized
    }

    $tunnelUrl = $null
    for ($i = 0; $i -lt 180 -and -not $tunnelUrl; $i++) {
        try {
            $tunnels = Invoke-RestMethod "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
            $tunnelUrl = ($tunnels.tunnels | Where-Object { $_.public_url -like "https*" } |
                          Select-Object -First 1).public_url
        } catch { }
        if (-not $tunnelUrl) { Write-Host -NoNewline "."; Start-Sleep -Seconds 1 }
    }
    Write-Host ""
    if (-not $tunnelUrl) { throw "ngrok tunnel did not start (check Console 2 / network)" }
    Write-Host "[OK] Tunnel: $tunnelUrl" -ForegroundColor Green

    # --- 5. point the bot at the tunnel ---
    $envPath = "$root\.env"
    $envText = [System.IO.File]::ReadAllText($envPath)
    $envText = [regex]::Replace($envText, "MINI_APP_URL=.*", "MINI_APP_URL=$tunnelUrl")
    [System.IO.File]::WriteAllText($envPath, $envText)
    Write-Host "[OK] MINI_APP_URL updated in .env" -ForegroundColor Green

    # --- 6. bot ---
    Start-Process -FilePath $py -ArgumentList "-3", "main.py" -WorkingDirectory $root
    Start-Sleep -Seconds 3
    $botProc = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
        Where-Object { $_.CommandLine -match "main\.py" }
    if ($botProc) { Write-Host "[OK] Bot is running" -ForegroundColor Green }
    else { throw "Bot exited immediately - run 'py -3 main.py' manually to see the error" }

    # --- 7. t.me link for YOUR bot (root TELEGRAM_TOKEN) ---
    $botUsername = $null
    if ($rootToken) {
        try {
            $me = Invoke-RestMethod "https://api.telegram.org/bot$rootToken/getMe" -TimeoutSec 5
            $botUsername = $me.result.username
            Write-Host "[OK] Launch bot: @$botUsername" -ForegroundColor Green
        } catch { Write-Host "[warn] could not reach Telegram getMe" -ForegroundColor Yellow }
    }

    # Browser admin hint: anonymous callers are not admins anymore.
    if (-not (Read-DotEnvValue "$backend\.env" "PULSE_DEV_ADMIN")) {
        Write-Host "[hint] to see the admin panel in a browser add PULSE_DEV_ADMIN=true to backend\.env" -ForegroundColor DarkGray
    }

    Write-Host ""
    Write-Host "==== Pulse is running ====" -ForegroundColor Green
    Write-Host " Mini App URL : $tunnelUrl"
    if ($botUsername) {
        Write-Host " Open in TG   : https://t.me/$botUsername  ->  Start  ->  Open Pulse"
        Start-Process "https://t.me/$botUsername"
    }
    Write-Host " Stop         : powershell -ExecutionPolicy Bypass -File stop-pulse.ps1"
    Write-Host " (API and ngrok run minimized; the bot shows its own window)"
}
catch {
    Write-Host ""
    Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Pause-End
}
