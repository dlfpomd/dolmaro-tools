@echo off
REM ============================================================
REM  Register Windows Task Scheduler for blog dashboard sync
REM  Runs every day at 12:00 PM (30 min after blog-import-task)
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

set "TASK_NAME=DolmaroBlogDashboardSync"
set "RUNNER=%~dp0sync_and_push.bat"

echo.
echo   Registering scheduled task...
echo   Name:    %TASK_NAME%
echo   When:    Every day at 12:00 PM
echo   Runs:    %RUNNER%
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
  "$trigger = New-ScheduledTaskTrigger -Daily -At 12pm;" ^
  "$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30);" ^
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
echo   Log file:    %USERPROFILE%\Desktop\dolmaro-sync.log
echo.
echo   Notes:
echo    - This ONLY updates the dashboard. The actual blog
echo      migration (blog-import-task) is a separate scheduler
echo      and is untouched.
echo    - First run should happen automatically at 12:00 PM.
echo      To run right now: schtasks /run /tn "%TASK_NAME%"
echo.
pause
