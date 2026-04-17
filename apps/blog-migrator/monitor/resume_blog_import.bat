@echo off
REM ============================================================
REM  Manually resume blog-import-task (cancel any pending pause).
REM  Run as Administrator.
REM ============================================================

net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [!] Administrator rights required.
    pause
    exit /b 1
)

set "MAIN_TASK=blog-import-task"
set "RESUMER_TASK=DolmaroResumeBlogImport"

echo.
echo   Re-enabling %MAIN_TASK%...
schtasks /change /tn "%MAIN_TASK%" /enable
if errorlevel 1 (
    echo   [!] Failed to enable %MAIN_TASK%.
) else (
    echo   Enabled.
)

echo.
echo   Removing any pending resumer task...
schtasks /query /tn "%RESUMER_TASK%" >nul 2>&1
if not errorlevel 1 (
    schtasks /delete /tn "%RESUMER_TASK%" /f
    echo   Removed %RESUMER_TASK%.
) else (
    echo   No resumer task found (nothing to remove).
)

echo.
echo   Status of %MAIN_TASK%:
schtasks /query /tn "%MAIN_TASK%" /fo LIST
echo.
pause
