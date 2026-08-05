@echo off
REM ============================================
REM 项目同步与Git推送脚本
REM 源目录: D:\work\telewave\ids\ids-gis-web
REM 目标目录: C:\Users\16697\Desktop\github\TW\idds7
REM ============================================

set "SRC_DIR=D:\work\telewave\ids\ids-gis-web"
set "DEST_DIR=C:\Users\16697\Desktop\github\TW\idds7"
set "LOG_FILE=%SRC_DIR%\sync_log.txt"

REM 获取当前时间作为日志前缀
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "TIMESTAMP=%dt:~0,4%-%dt:~4,2%-%dt:~6,2% %dt:~8,2%:%dt:~10,2%:%dt:~12,2%"

echo ============================================ >> "%LOG_FILE%"
echo [%TIMESTAMP%] 开始同步任务 >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

REM 检查源目录是否存在
if not exist "%SRC_DIR%" (
    echo [错误] 源目录不存在: %SRC_DIR% >> "%LOG_FILE%"
    exit /b 1
)

REM 确保目标目录存在
if not exist "%DEST_DIR%" (
    echo [信息] 创建目标目录: %DEST_DIR% >> "%LOG_FILE%"
    mkdir "%DEST_DIR%"
)

REM 使用robocopy同步文件（排除.git目录和node_modules）
echo [信息] 正在同步文件... >> "%LOG_FILE%"
robocopy "%SRC_DIR%" "%DEST_DIR%" /E /XD .git node_modules __pycache__ .venv venv .idea .vscode /XF *.pyc Thumbs.db /NP /NJH /NJS /LOG:"%SRC_DIR%\robocopy_log.txt"

REM 检查robocopy返回值（0-7表示成功，8表示有失败）
if %ERRORLEVEL% GEQ 8 (
    echo [警告] 同步过程中出现错误 (ErrorLevel: %ERRORLEVEL%) >> "%LOG_FILE%"
) else (
    echo [成功] 文件同步完成 (ErrorLevel: %ERRORLEVEL%) >> "%LOG_FILE%"
)
echo. >> "%LOG_FILE%"

REM 进入目标目录进行Git操作
echo [信息] 进入Git操作阶段... >> "%LOG_FILE%"
pushd "%DEST_DIR%" 2>nul || (
    echo [错误] 无法进入目标目录: %DEST_DIR% >> "%LOG_FILE%"
    exit /b 1
)

REM 初始化git仓库（如果还不存在）
if not exist ".git" (
    echo [信息] 初始化Git仓库... >> "%LOG_FILE%"
    git init >> "%LOG_FILE%" 2>&1
    git add . >> "%LOG_FILE%" 2>&1
)

REM 配置git用户信息（如果没有配置过）
git config user.name >> "%LOG_FILE%" 2>&1 || git config user.name "AutoSync"
git config user.email >> "%LOG_FILE%" 2>&1 || git config user.email "sync@example.com"

REM 添加所有更改
echo [信息] 执行git add... >> "%LOG_FILE%"
git add -A >> "%LOG_FILE%" 2>&1

REM 检查是否有更改需要提交
for /f "delims=" %%i in ('git status --porcelain') do (
    set "HAS_CHANGES=true"
)

if "%HAS_CHANGES%" == "true" (
    REM 生成提交信息
    set "COMMIT_MSG=Auto sync: %TIMESTAMP% | Changes: %DATE% %TIME%"
    
    echo [信息] 执行git commit... >> "%LOG_FILE%"
    git commit -m "%COMMIT_MSG%" >> "%LOG_FILE%" 2>&1
    
    if %ERRORLEVEL% EQU 0 (
        echo [成功] 提交成功: %COMMIT_MSG% >> "%LOG_FILE%"
    ) else (
        echo [错误] 提交失败 >> "%LOG_FILE%"
    )
    
    REM 尝试推送到远程
    echo [信息] 执行git push... >> "%LOG_FILE%"
    git push >> "%LOG_FILE%" 2>&1
    
    if %ERRORLEVEL% EQU 0 (
        echo [成功] 推送成功 >> "%LOG_FILE%"
    ) else (
        echo [警告] 推送失败 (可能需要配置remote或认证) >> "%LOG_FILE%"
        echo [提示] 请手动运行: cd %DEST_DIR% && git push >> "%LOG_FILE%"
    )
) else (
    echo [信息] 没有发现需要提交的更改 >> "%LOG_FILE%"
)

popd

echo. >> "%LOG_FILE%"
echo [%TIMESTAMP%] 同步任务结束 >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

REM 显示最后几行日志
echo.
echo ======== 同步日志 ========
type "%LOG_FILE%" | findstr /n "." | findstr /c:"[%TIMESTAMP%]" /c:"成功" /c:"失败" /c:"错误" /c:"警告" || (
    echo 请查看完整日志: %LOG_FILE%
)
echo ==========================

exit /b 0