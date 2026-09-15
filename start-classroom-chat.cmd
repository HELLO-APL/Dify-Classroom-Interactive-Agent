@echo off
cd /d "%~dp0"
node "%~dp0classroom-chat\server.mjs"
echo.
echo 课堂对话服务已停止。
pause
