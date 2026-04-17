@echo off
REM ============================================================
REM  Windows 작업 스케줄러 등록 — 월/금 오전 10시, 수면모드 깨우기 포함
REM  한 번만 실행하면 됨. 관리자 권한 필요.
REM ============================================================
chcp 65001 >nul

REM 관리자 권한 확인
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo  관리자 권한으로 실행해주세요.
    echo  이 파일을 우클릭 ^> "관리자 권한으로 실행"
    echo.
    pause
    exit /b 1
)

set "TASK_NAME=DolmaroKeywordMonitor"
set "RUNNER=%~dp0run_and_push.bat"

echo.
echo  작업 스케줄러 등록 중...
echo  이름: %TASK_NAME%
echo  시간: 매주 월요일, 금요일 오전 10:00
echo  실행: %RUNNER%
echo  옵션: 수면모드에서 자동 깨우기
echo.

REM 기존 등록분 제거 (있으면)
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo  기존 작업 제거 중...
    schtasks /delete /tn "%TASK_NAME%" /f >nul
)

REM PowerShell로 등록 (WakeToRun 설정을 위해)
powershell -NoProfile -Command ^
  "$action = New-ScheduledTaskAction -Execute '%RUNNER%';" ^
  "$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Friday -At 10am;" ^
  "$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3);" ^
  "$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest;" ^
  "Register-ScheduledTask -TaskName '%TASK_NAME%' -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null;" ^
  "Write-Host '  등록 완료.'"

if errorlevel 1 (
    echo.
    echo  등록 실패.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  등록 완료!
echo ============================================================
echo.
echo  확인:  schtasks /query /tn "%TASK_NAME%"
echo  지금 실행: schtasks /run /tn "%TASK_NAME%"
echo  제거:  schtasks /delete /tn "%TASK_NAME%" /f
echo.
echo  주의:
echo   - 노트북 덮개가 닫혀 있으면 일부 상황에서 깨우지 않습니다.
echo     제어판 ^> 전원 옵션 ^> "덮개를 닫을 때" = "아무 작업도 안 함"
echo     권장.
echo   - 첫 푸시 시 Git Credential Manager가 GitHub 로그인 창을
echo     한 번 띄웁니다. 로그인 후에는 자동 저장됩니다.
echo.
pause
