@echo off
REM ============================================================
REM  Dolmaro 키워드 모니터 — 자동 실행 + git push
REM  Windows 작업 스케줄러에서 월/금 10시에 호출됨
REM ============================================================
chcp 65001 >nul
setlocal

REM 레포 루트로 이동 (이 배치 위치: apps/keyword-analyzer/monitor/)
pushd "%~dp0..\..\.."
set "REPO_ROOT=%cd%"
echo [%date% %time%] REPO_ROOT = %REPO_ROOT%

REM 로그 폴더
set "LOG_DIR=%REPO_ROOT%\apps\keyword-analyzer\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\%date:~0,4%-%date:~5,2%-%date:~8,2%.log"

REM Python 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo Python not installed. >> "%LOG_FILE%"
    echo Python not installed.
    pause
    exit /b 1
)

REM Git 확인
git --version >nul 2>&1
if errorlevel 1 (
    echo Git not installed. >> "%LOG_FILE%"
    echo Git not installed.
    pause
    exit /b 1
)

echo. >> "%LOG_FILE%"
echo ======================================================== >> "%LOG_FILE%"
echo  시작: %date% %time% >> "%LOG_FILE%"
echo ======================================================== >> "%LOG_FILE%"

REM 1) WSL에서 푸시된 최신 코드/키워드 당기기 (충돌 방지: rebase + 실패시 중단)
echo [1/4] git pull --rebase >> "%LOG_FILE%"
git pull --rebase >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo git pull 실패. 충돌 여부 확인 필요. >> "%LOG_FILE%"
    echo git pull 실패. 충돌 여부 확인 필요.
    popd
    exit /b 1
)

REM 2) 모니터 실행 (--no-pause = 자동 종료, 스케줄러에서는 Enter를 누를 사람이 없음)
echo [2/4] python naver_monitor.py --no-pause >> "%LOG_FILE%"
python "%REPO_ROOT%\apps\keyword-analyzer\monitor\naver_monitor.py" --no-pause >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo 모니터 실행 실패. >> "%LOG_FILE%"
    echo 모니터 실행 실패.
    popd
    exit /b 1
)

REM 3) 결과 파일 stage + commit
echo [3/4] git add + commit >> "%LOG_FILE%"
git add "apps/keyword-analyzer/data" >> "%LOG_FILE%" 2>&1

REM 변경사항 있는지 확인
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "keyword monitor: %date% %time%" >> "%LOG_FILE%" 2>&1
) else (
    echo 변경사항 없음 (commit skip) >> "%LOG_FILE%"
    popd
    exit /b 0
)

REM 4) push
echo [4/4] git push >> "%LOG_FILE%"
git push >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    echo git push 실패. Git Credential Manager 설정 확인. >> "%LOG_FILE%"
    echo git push 실패. Git Credential Manager 설정 확인.
    popd
    exit /b 1
)

echo. >> "%LOG_FILE%"
echo  완료: %date% %time% >> "%LOG_FILE%"
echo ======================================================== >> "%LOG_FILE%"

popd
endlocal
exit /b 0
