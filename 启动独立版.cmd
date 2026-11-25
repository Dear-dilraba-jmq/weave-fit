@echo off
setlocal
set "OUTFIT_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "OUTFIT_NODE=C:\Program Files\Tuanjie\Tuanjie AI\cli\bin\win32-x64\node.exe"
"%OUTFIT_NODE%" "%~dp0outfit-independent\launch.cjs"
if errorlevel 1 pause
