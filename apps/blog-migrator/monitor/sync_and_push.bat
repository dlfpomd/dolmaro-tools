@echo off
REM ============================================================
REM  Dolmaro blog-migrator dashboard sync
REM  Triggers WSL Ubuntu to run the sync script.
REM  Called by Windows Task Scheduler.
REM ============================================================
setlocal

set "LOG_FILE=%USERPROFILE%\Desktop\dolmaro-sync.log"

echo. >> "%LOG_FILE%"
echo ===== START: %DATE% %TIME% ===== >> "%LOG_FILE%"
echo Computer: %COMPUTERNAME% / User: %USERNAME% >> "%LOG_FILE%"

REM WSL warmup (match blog-import-daily.bat pattern)
echo Step 1: WSL warmup... >> "%LOG_FILE%"
wsl.exe -d Ubuntu --exec /bin/bash -c "echo WSL ready: $(date)" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo WSL warmup failed, retry in 30s... >> "%LOG_FILE%"
    timeout /t 30 /nobreak
    wsl.exe -d Ubuntu --exec /bin/bash -c "echo WSL retry: $(date)" >> "%LOG_FILE%" 2>&1
)

REM Run sync
echo Step 2: Running dashboard sync... >> "%LOG_FILE%"
wsl.exe -d Ubuntu -u dolmaro --exec /bin/bash -lc "/home/dolmaro/dolmaro-tools/apps/blog-migrator/monitor/sync_and_push.sh" >> "%LOG_FILE%" 2>&1
set EXIT_CODE=%errorlevel%

echo ===== END: %DATE% %TIME% (exit %EXIT_CODE%) ===== >> "%LOG_FILE%"

exit /b %EXIT_CODE%
