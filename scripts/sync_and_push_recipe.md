# 同步与推送Recipe

## 任务说明
将项目文件从源目录同步到目标目录，并自动提交推送到远程Git仓库。

## 源目录
`D:\work\telewave\ids\ids-gis-web`

## 目标目录
`C:\Users\16697\Desktop\github\TW\idds7`

## 执行脚本
```bash
cd D:\work\telewave\ids\ids-gis-web
python sync_and_push_fixed.py
```

## 同步规则
- 排除 `.git`, `node_modules`, `__pycache__`, `.venv`, `venv`, `.idea`, `.vscode` 目录
- 排除 `Thumbs.db`, `*.pyc` 文件
- 增量同步（只复制变更文件）
- 自动执行 `git add -A`、`git commit`、`git push`

## 日志位置
- `D:\work\telewave\ids\ids-gis-web\sync_log.txt`
- `D:\work\telewave\ids\ids-gis-web\robocopy.log`