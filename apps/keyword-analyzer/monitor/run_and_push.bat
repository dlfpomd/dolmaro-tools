@echo off
REM ============================================================
REM  Dolmaro keyword monitor - auto run + git push
REM  Called by Windows Task Scheduler at Mon/Fri 10:00 AM
REM
REM  Strategy:
REM  - Python + Selenium (needs Chrome, ~30-40 min, accurate SERP)
REM  - git commit/push is delegated to WSL (uses WSL credentials)
REM    because Windows-side git has no identity / credentials set.
REM
REM  Naver Open API 버전 (naver_monitor_api.py)은 첫 페이지 노출이
REM  아니라 "블로그/웹문서 상위 N개 관련도 랭킹"을 측정하므로
REM  스케줄 용도로는 쓰지 않습니다. Claude가 즉석 확인할 때만 사용.
REM ============================================================
setlocal

pushd "%~dp0..\..\.."
set "REPO_ROOT=%cd%"
echo [%date% %time%] REPO_ROOT = %REPO_ROOT%

set "LOG_DIR=%REPO_ROOT%\apps\keyword-analyzer\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\%date:~0,4%-%date:~5,2%-%date:~8,2%.log"

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Python not installed. >> "%LOG_FILE%"
    echo Python not installed.
    pause
    exit /b 1
)

echo. >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo  START: %date% %time% >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"

REM 1) Sync via WSL first (pull latest keyword lists + prior data)
echo [1/3] WSL: git pull --rebase >> "%LOG_FILE%"
wsl.exe -d Ubuntu -u dolmaro --exec /bin/bash -lc "cd /mnt/c/dolmaro-tools && git pull --rebase origin main" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo git pull failed. >> "%LOG_FILE%"
    echo git pull failed.
    popd
    exit /b 1
)

REM 2) Run the monitor (Windows Python + Selenium)
echo [2/3] python naver_monitor.py --no-pause >> "%LOG_FILE%"
python "%REPO_ROOT%\apps\keyword-analyzer\monitor\naver_monitor.py" --no-pause >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo Monitor run failed. >> "%LOG_FILE%"
    echo Monitor run failed.
    popd
    exit /b 1
)

REM 3) Commit + push via WSL (WSL has the GitHub credentials)
echo [3/3] WSL: commit + push >> "%LOG_FILE%"
wsl.exe -d Ubuntu -u dolmaro --exec /bin/bash -lc "/mnt/c/dolmaro-tools/apps/keyword-analyzer/monitor/commit_and_push.sh" >> "%LOG_FILE%" 2>&1
set EXIT_CODE=%errorlevel%

echo. >> "%LOG_FILE%"
echo  DONE: %date% %time% (exit %EXIT_CODE%) >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"

popd
endlocal
exit /b %EXIT_CODE%
