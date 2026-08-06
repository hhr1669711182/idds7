# Windows定时任务配置指南

## 已完成的文件

项目目录 `D:\work\telewave\ids\ids-gis-web` 下已创建以下脚本：

### 1. sync_and_push_fixed.py - 主同步脚本
- 使用 robocopy 同步文件（排除 .git, node_modules 等）
- 自动执行 git add, commit, push
- 日志输出到 sync_log.txt

### 2. run_sync_manual.bat - 手动执行脚本
双击即可手动运行同步和推送

## 配置定时任务（需要管理员权限）

### 方法一：命令行（推荐）

**以管理员身份打开 PowerShell 或 CMD，执行：**

```powershell
# 删除已有任务（如果有）
schtasks /delete /tn "GIS_Sync_Auto_Push" /f

# 创建每日凌晨2点执行的定时任务
schtasks /create /tn "GIS_Sync_Auto_Push" /tr "python D:\work\telewave\ids\ids-gis-web\sync_and_push_fixed.py" /sc daily /st 02:00 /ru SYSTEM /rl HIGHEST /f

# 查看任务状态
schtasks /query /tn "GIS_Sync_Auto_Push" /v /fo LIST
```

### 方法二：图形界面

1. 按 Win+R，输入 `taskschd.msc` 打开任务计划程序
2. 右侧点击 "创建基本任务"
3. 名称：`GIS_Sync_Auto_Push`
4. 触发器：每天，时间设置为 `02:00`
5. 操作：启动程序
   - 程序/脚本：`python`
   - 添加参数：`D:\work\telewave\ids\ids-gis-web\sync_and_push_fixed.py`
   - 起始于：`D:\work\telewave\ids\ids-gis-web`
6. 完成

## 测试与验证

### 手动执行测试
```bash
cd D:\work\telewave\ids\ids-gis-web
python sync_and_push_fixed.py
```

### 立即运行定时任务
```powershell
schtasks /run /tn "GIS_Sync_Auto_Push"
```

### 查看执行日志
```bash
type D:\work\telewave\ids\ids-gis-web\sync_log.txt
```

### 查看任务历史
```powershell
Get-ScheduledTaskInfo -TaskName "GIS_Sync_Auto_Push" | Format-List LastRunTime, LastResult, NextRunTime
```

## 排错指南

| 问题 | 解决方法 |
|------|----------|
| Git push 失败 | 检查目标仓库是否配置了远程地址和认证 |
| 权限错误 | 以管理员身份运行脚本 |
| Python未找到 | 确保Python在系统PATH中，或修改脚本中的python路径 |

## 任务管理命令

```powershell
# 查看任务列表
schtasks /query /fo LIST | findstr "GIS_Sync"

# 禁用任务
schtasks /change /tn "GIS_Sync_Auto_Push" /disable

# 启用任务
schtasks /change /tn "GIS_Sync_Auto_Push" /enable

# 删除任务
schtasks /delete /tn "GIS_Sync_Auto_Push" /f
```