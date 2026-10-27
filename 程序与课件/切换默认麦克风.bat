@echo off
rem ---------------------------------------------------------------
rem Switch the Windows default recording device.
rem Run this if students' speech is not picked up at all.
rem It only changes the "default device" setting. No admin needed.
rem ---------------------------------------------------------------
chcp 65001 >nul
pushd "%~dp0"

set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"

rem Find the single .ps1 next to this file (keeps this .bat ASCII-only).
set "SCRIPT="
for %%f in ("%~dp0*.ps1") do if not defined SCRIPT set "SCRIPT=%%~ff"
if not defined SCRIPT goto :missing

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Interactive
goto :done

:missing
echo [ERROR] The companion .ps1 file is missing next to this .bat.

:done
popd
echo.
pause
