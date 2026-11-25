@echo off
setlocal
set "OUTFIT_PUBLIC_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "OUTFIT_PUBLIC_NODE=C:\Program Files\Tuanjie\Tuanjie AI\cli\bin\win32-x64\node.exe"
"%OUTFIT_PUBLIC_NODE%" "%~dp0outfit-independent\scripts\stop-public.cjs"
pause
