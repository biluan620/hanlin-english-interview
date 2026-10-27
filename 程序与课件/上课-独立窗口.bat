@echo off
rem ---------------------------------------------------------------
rem Opens the interview page in a standalone window.
rem No address bar, no tabs, microphone auto-allowed.
rem Use this if the .exe is blocked by SmartScreen, or as a backup.
rem Keep this file in the same folder as the interview .html file.
rem ---------------------------------------------------------------
chcp 65001 >nul
pushd "%~dp0"

set "PAGE="
for %%f in ("%~dp0*离线版*.html") do if not defined PAGE set "PAGE=%%~ff"
if not defined PAGE goto :nopage

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

rem A separate profile so the flags always apply even if Edge is already running.
set "PROFILE=%LOCALAPPDATA%\HanLinEdgeApp"
if not exist "%PROFILE%" mkdir "%PROFILE%"

if exist "%EDGE%" (
  start "" "%EDGE%" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --use-fake-ui-for-media-stream --start-maximized --app="%PAGE%"
  goto :done
)

echo Edge not found. Opening with the default browser instead.
echo The browser will ask for microphone permission once - please click Allow.
start "" "%PAGE%"
goto :done

:nopage
echo [ERROR] No interview .html file found next to this .bat.
pause

:done
popd
