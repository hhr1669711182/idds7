# Windows定时任务配置脚本 - 自动同步并推送
# 以管理员身份运行此脚本

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Windows定时任务配置工具" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$ScriptPath = "D:\work\telewave\ids\ids-gis-web\sync_and_push_fixed.py"
$PythonPath = "python"
$TaskName = "GIS_Sync_Auto_Push"
$TaskDescription = "自动同步项目文件到备份位置并推送到远程仓库"

# 检查Python
try {
    $pythonVersion = python --version 2>&1
    Write-Host "[信息] Python版本: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "[错误] 未找到Python，请先安装Python" -ForegroundColor Red
    pause
    exit 1
}

# 检查脚本文件
if (-not (Test-Path $ScriptPath)) {
    Write-Host "[错误] 脚本文件不存在: $ScriptPath" -ForegroundColor Red
    pause
    exit 1
}

Write-Host "[信息] 脚本路径: $ScriptPath" -ForegroundColor Green
Write-Host "[信息] 任务名称: $TaskName" -ForegroundColor Green
Write-Host ""

# 删除已存在的任务
Write-Host "[信息] 检查现有任务..." -ForegroundColor Yellow
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "[成功] 已清理旧任务" -ForegroundColor Green

# 创建触发器 - 每天凌晨2点执行
Write-Host "[信息] 创建每日触发器..." -ForegroundColor Yellow
$trigger = New-ScheduledTaskTrigger -Daily -At 02:00
Write-Host "[成功] 触发器创建成功" -ForegroundColor Green

# 创建动作
Write-Host "[信息] 创建执行动作..." -ForegroundColor Yellow
$action = New-ScheduledTaskAction -Execute "python" -Argument "`"$ScriptPath`""
Write-Host "[成功] 动作创建成功" -ForegroundColor Green

# 设置任务参数
Write-Host "[信息] 注册定时任务..." -ForegroundColor Yellow
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description $TaskDescription `
    -Force

Write-Host "" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  定时任务创建成功！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 显示任务详情
Write-Host "[信息] 任务详情:" -ForegroundColor Yellow
Get-ScheduledTask -TaskName $TaskName | Format-List TaskName, State, Description, Triggers, Actions

Write-Host ""
Write-Host "手动测试命令:" -ForegroundColor Cyan
Write-Host "  schtasks /run /tn `"$TaskName`"" -ForegroundColor White
Write-Host ""
Write-Host "查看日志:" -ForegroundColor Cyan
Write-Host "  Get-Content `"D:\work\telewave\ids\ids-gis-web\sync_log.txt`" -Tail 20" -ForegroundColor White
Write-Host ""

pause