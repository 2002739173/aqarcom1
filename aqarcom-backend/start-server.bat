@echo off
REM AqarCom - starts MongoDB (portable) and the API server. Log: server\launcher-log.txt
cd /d "%~dp0"
node start-all.js
pause
