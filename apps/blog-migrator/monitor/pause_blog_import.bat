@echo off
REM ============================================================
REM  Pause blog-import-task for N days, then auto-resume.
REM  Usage (as Administrator):
REM    pause_blog_import.bat          (default 10 days)
REM    pause_blog_import.bat 14       (14 days)
REM  A one-time task "DolmaroResumeBlogImport" is registered to
REM  re-enable blog-import-task at the given future date 11:15 AM
REM  and then remove itself. The blog-import-task will resume
REM  running at its normal 11:30 time on that day.
REM  Does NOT affect DolmaroBlogDashboardSync (the dashboard sync
REM  keeps running; sitemap just won't change during the pause).
REM ============================================================

net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [!] Administrator rights required.
    echo   Right-click this file and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

set "MAIN_TASK=blog-import-task"
set "RESUMER_TASK=DolmaroResumeBlogImport"
set "PAUSE_DAYS=%~1"
if "%PAUSE_DAYS%"=="" set "PAUSE_DAYS=10"

echo.
echo   Pausing "%MAIN_TASK%" for %PAUSE_DAYS% days
echo.

REM Verify main task exists
schtasks /query /tn "%MAIN_TASK%" >nul 2>&1
if errorlevel 1 (
    echo   [!] Task "%MAIN_TASK%" not found.
    pause
    exit /b 1
)

REM Disable the migration task
schtasks /change /tn "%MAIN_TASK%" /disable >nul
if errorlevel 1 (
    echo   [!] Failed to disable %MAIN_TASK%.
    pause
    exit /b 1
)
echo   Disabled %MAIN_TASK%.

REM Remove any previous resumer
schtasks /query /tn "%RESUMER_TASK%" >nul 2>&1
if not errorlevel 1 (
    schtasks /delete /tn "%RESUMER_TASK%" /f >nul
    echo   Removed previous resumer.
)

REM Register a one-time task that re-enables the main task and then deletes itself
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$when = (Get-Date).AddDays(%PAUSE_DAYS%).Date.AddHours(11).AddMinutes(15);" ^
  "$trigger = New-ScheduledTaskTrigger -Once -At $when;" ^
  "$inner = 'Enable-ScheduledTask -TaskName \"%MAIN_TASK%\"; Unregister-ScheduledTask -TaskName \"%RESUMER_TASK%\" -Confirm:$false';" ^
  "$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -Command ' + $inner);" ^
  "$settings = New-ScheduledTaskSettingsSet -WakeToRun -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries;" ^
  "$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest;" ^
  "Register-ScheduledTask -TaskName '%RESUMER_TASK%' -Trigger $trigger -Action $action -Settings $settings -Principal $principal | Out-Null;" ^
  "Write-Host ('   Resume scheduled for: ' + $when.ToString('yyyy-MM-dd HH:mm'))"

if errorlevel 1 (
    echo.
    echo   [!] Failed to register resumer. Re-enable manually with:
    echo       schtasks /change /tn "%MAIN_TASK%" /enable
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   DONE
echo ============================================================
echo.
echo   Blog migration is paused until the resume date above.
echo.
echo   Resume earlier (cancel pause):
echo     schtasks /change /tn "%MAIN_TASK%" /enable
echo     schtasks /delete /tn "%RESUMER_TASK%" /f
echo.
echo   Confirm status:
echo     schtasks /query /tn "%MAIN_TASK%" /v /fo LIST
echo     schtasks /query /tn "%RESUMER_TASK%" /v /fo LIST
echo.
pause
