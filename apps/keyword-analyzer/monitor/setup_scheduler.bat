@echo off
REM ============================================================
REM  Register Windows Task Scheduler
REM  Runs every Mon/Fri at 10:00 AM, wakes PC from sleep
REM  Run this ONCE as Administrator
REM ============================================================

REM Admin check
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [!] Administrator rights required.
    echo   Right-click this file and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

set "TASK_NAME=DolmaroKeywordMonitor"
set "RUNNER=%~dp0run_and_push.bat"

echo.
echo   Registering scheduled task...
echo   Name:    %TASK_NAME%
echo   When:    Every Monday and Friday at 10:00 AM
echo   Runs:    %RUNNER%
echo   Option:  Wake from sleep
echo.

REM Remove existing task if present
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo   Removing existing task...
    schtasks /delete /tn "%TASK_NAME%" /f >nul
)

REM Register via PowerShell (for WakeToRun option)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$action = New-ScheduledTaskAction -Execute '%RUNNER%';" ^
  "$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Friday -At 10am;" ^
  "$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3);" ^
  "$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest;" ^
  "Register-ScheduledTask -TaskName '%TASK_NAME%' -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null;" ^
  "Write-Host '   Registration complete.'"

if errorlevel 1 (
    echo.
    echo   [!] Registration failed.
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   DONE!
echo ============================================================
echo.
echo   Check:       schtasks /query /tn "%TASK_NAME%"
echo   Run now:     schtasks /run /tn "%TASK_NAME%"
echo   Remove:      schtasks /delete /tn "%TASK_NAME%" /f
echo.
echo   Notes:
echo    - If laptop lid is closed, Windows may not wake it.
echo      Control Panel ^> Power Options ^> "When I close the lid"
echo      set to "Do nothing" is recommended.
echo    - On the first push, Git Credential Manager will open
echo      a browser window for GitHub login. Log in once and
echo      credentials are saved automatically.
echo.
pause
