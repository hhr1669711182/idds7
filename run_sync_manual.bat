@echo off
REM ============================================
REM 手动执行同步脚本
REM ============================================

echo ============================================
echo   项目同步与Git推送 - 手动执行
echo ============================================
echo.

set SCRIPT_PATH=D:\work\telewave\ids\ids-gis-web\sync_and_push_fixed.py

REM 检查Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到Python，请安装Python
    pause
    exit /b 1
)

echo [信息] 开始执行同步脚本...
echo.

python "%SCRIPT_PATH%"

echo.
echo ============================================
echo   执行完成
echo ============================================
echo.
echo 查看日志: type sync_log.txt
echo.
pause