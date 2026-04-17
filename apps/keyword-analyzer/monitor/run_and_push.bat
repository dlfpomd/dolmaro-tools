@echo off
REM ============================================================
REM  Dolmaro keyword monitor - auto run + git push
REM  Called by Windows Task Scheduler at Mon/Fri 10:00 AM
REM ============================================================
setlocal

REM Move to repo root (this bat lives at apps/keyword-analyzer/monitor/)
pushd "%~dp0..\..\.."
set "REPO_ROOT=%cd%"
echo [%date% %time%] REPO_ROOT = %REPO_ROOT%

REM Log folder
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

REM Check Git
git --version >nul 2>&1
if errorlevel 1 (
    echo Git not installed. >> "%LOG_FILE%"
    echo Git not installed.
    pause
    exit /b 1
)

echo. >> "%LOG_FILE%"
echo ======================================================== >> "%LOG_FILE%"
echo  START: %date% %time% >> "%LOG_FILE%"
echo ======================================================== >> "%LOG_FILE%"

REM 1) Pull latest code and keywords
echo [1/4] git pull --rebase >> "%LOG_FILE%"
git pull --rebase >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo git pull failed. Check for conflicts. >> "%LOG_FILE%"
    echo git pull failed. Check for conflicts.
    popd
    exit /b 1
)

REM 2) Run monitor (--no-pause = auto-close, no human to press Enter)
echo [2/4] python naver_monitor.py --no-pause >> "%LOG_FILE%"
python "%REPO_ROOT%\apps\keyword-analyzer\monitor\naver_monitor.py" --no-pause >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo Monitor run failed. >> "%LOG_FILE%"
    echo Monitor run failed.
    popd
    exit /b 1
)

REM 3) Stage + commit results
echo [3/4] git add + commit >> "%LOG_FILE%"
git add "apps/keyword-analyzer/data" >> "%LOG_FILE%" 2>&1

REM Check if there are changes
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "keyword monitor: %date% %time%" >> "%LOG_FILE%" 2>&1
) else (
    echo No changes to commit. >> "%LOG_FILE%"
    popd
    exit /b 0
)

REM 4) push
echo [4/4] git push >> "%LOG_FILE%"
git push >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo git push failed. Check Git Credential Manager. >> "%LOG_FILE%"
    echo git push failed. Check Git Credential Manager.
    popd
    exit /b 1
)

echo. >> "%LOG_FILE%"
echo  DONE: %date% %time% >> "%LOG_FILE%"
echo ======================================================== >> "%LOG_FILE%"

popd
endlocal
exit /b 0
