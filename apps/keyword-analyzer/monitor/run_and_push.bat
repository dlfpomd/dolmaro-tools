@echo off
REM ============================================================
REM  Dolmaro keyword monitor - auto run + git push
REM  Called by Windows Task Scheduler at Mon 10:00 AM (KST)
REM
REM  Strategy:
REM  - Python + Selenium on Windows (needs Chrome, ~30-40 min)
REM    Measures actual first-page SERP exposure.
REM  - git commit/push delegated to WSL (WSL has the credentials).
REM
REM  Fixes (2026-05-19):
REM  - chcp 65001 + PYTHONIOENCODING=utf-8: 한글 출력 cp949 crash 해결
REM  - Selenium Manager 사용: ChromeDriver 버전 불일치 자동 해결
REM    (이전 4월 20일 이후 모든 실행 실패 원인)
REM ============================================================
chcp 65001 >nul
setlocal
set "PYTHONIOENCODING=utf-8"
set "PYTHONUTF8=1"

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

REM 3) Commit + push via WSL
echo [3/3] WSL: commit + push >> "%LOG_FILE%"
wsl.exe -d Ubuntu -u dolmaro --exec /bin/bash -lc "/mnt/c/dolmaro-tools/apps/keyword-analyzer/monitor/commit_and_push.sh" >> "%LOG_FILE%" 2>&1
set EXIT_CODE=%errorlevel%

echo. >> "%LOG_FILE%"
echo  DONE: %date% %time% (exit %EXIT_CODE%) >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"

popd
endlocal
exit /b %EXIT_CODE%
