@echo off
REM ============================================
REM 配置Windows定时任务 - 自动同步项目并推送
REM ============================================

echo ============================================
echo   配置Windows定时任务
echo ============================================
echo.

set "SCRIPT_PATH=D:\work\telewave\ids\ids-gis-web\sync_and_push_fixed.py"
set "PYTHON_PATH=python"
set "TASK_NAME=GIS_Sync_Auto_Push"
set "TRIGGER_TYPE=DAILY"
set "START_TIME=02:00"

REM 检查Python路径
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到Python，请安装Python或修改脚本路径
    pause
    exit /b 1
)

echo [信息] 正在创建Windows定时任务...
echo [信息] 任务名称: %TASK_NAME%
echo [信息] 执行脚本: %SCRIPT_PATH%
echo [信息] 计划类型: 每天 %START_TIME% 执行
echo.

REM 删除已存在的任务（如果存在）
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

REM 创建每日定时任务 - 凌晨2点执行
schtasks /create /tn "%TASK_NAME%" /tr "\"%PYTHON_PATH%\" \"%SCRIPT_PATH%\"" /sc %TRIGGER_TYPE% /st %START_TIME% /ru SYSTEM /rl HIGHEST /f

if %ERRORLEVEL% EQU 0 (
    echo [成功] 定时任务创建成功！
    echo.
    echo 任务详情:
    schtasks /query /tn "%TASK_NAME%" /v /fo LIST
    echo.
    echo 手动执行测试:
    echo schtasks /run /tn "%TASK_NAME%"
    echo.
) else (
    echo [错误] 创建定时任务失败
    echo 请以管理员身份运行此脚本
)

echo.
pause