@echo off
REM ============================================================
REM  Selenium 버전 수동 실행 (유튜브/이미지까지 풀 체크)
REM  스케줄 실행은 run_and_push.bat (API 버전)에서 담당합니다.
REM  이 bat은 원장님이 정밀 확인할 때 더블클릭으로 쓰세요.
REM  소요 시간: 약 30~40분
REM ============================================================
setlocal

pushd "%~dp0..\..\.."
set "REPO_ROOT=%cd%"
echo [%date% %time%] REPO_ROOT = %REPO_ROOT%

set "LOG_DIR=%REPO_ROOT%\apps\keyword-analyzer\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\%date:~0,4%-%date:~5,2%-%date:~8,2%-selenium.log"

python --version >nul 2>&1
if errorlevel 1 (
    echo Python not installed.
    pause
    exit /b 1
)

echo. >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo  START (Selenium manual): %date% %time% >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"

echo [1/3] WSL: git pull --rebase >> "%LOG_FILE%"
wsl.exe -d Ubuntu -u dolmaro --exec /bin/bash -lc "cd /mnt/c/dolmaro-tools && git pull --rebase origin main" >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo git pull failed.
    popd
    exit /b 1
)

echo [2/3] python naver_monitor.py --no-pause >> "%LOG_FILE%"
python "%REPO_ROOT%\apps\keyword-analyzer\monitor\naver_monitor.py" --no-pause >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo Monitor run failed.
    popd
    exit /b 1
)

echo [3/3] WSL: commit + push >> "%LOG_FILE%"
wsl.exe -d Ubuntu -u dolmaro --exec /bin/bash -lc "/mnt/c/dolmaro-tools/apps/keyword-analyzer/monitor/commit_and_push.sh" >> "%LOG_FILE%" 2>&1
set EXIT_CODE=%errorlevel%

echo. >> "%LOG_FILE%"
echo  DONE: %date% %time% (exit %EXIT_CODE%) >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"

popd
endlocal
exit /b %EXIT_CODE%
