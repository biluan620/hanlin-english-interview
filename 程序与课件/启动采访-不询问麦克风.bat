@echo off
rem Opens the HanLin interview page in Microsoft Edge with the microphone already
rem allowed, so the browser never asks for permission.
rem Keep this file in the same folder as the interview .html file.
setlocal
cd /d "%~dp0"

set "PAGE="
rem 文件夹里还有别的 html（例如麦克风体检页），所以只认名字里带“离线版”的那个
for %%f in ("%~dp0*离线版*.html") do if not defined PAGE set "PAGE=%%~ff"
if not defined PAGE (
  echo [ERROR] No .html file found in this folder.
  echo Put this .bat next to the interview page and try again.
  echo.
  pause
  exit /b 1
)

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

rem Keep the browser profile in LocalAppData (NOT %TEMP%) so records and the
rem saved AI key survive Windows disk cleanup. Must be set outside the if-block,
rem otherwise cmd expands it before it is assigned.
set "PROFILE=%LOCALAPPDATA%\HanLinEdge"
if not exist "%PROFILE%" mkdir "%PROFILE%"

if exist "%EDGE%" (
  rem Use a separate profile so the flags always apply, even if Edge is already open.
  start "" "%EDGE%" --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check --use-fake-ui-for-media-stream --start-maximized "%PAGE%"
) else (
  echo Edge not found. Opening with the default browser instead.
  echo The browser will ask for microphone permission once - please click Allow.
  start "" "%PAGE%"
)
endlocal
