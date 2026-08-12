# -*- coding: utf-8 -*-
import os
import sys
import subprocess
from datetime import datetime

SRC_DIR = r"D:\work\telewave\ids\ids-gis-web"
DEST_DIR = r"C:\Users\16697\Desktop\github\TW\idds7"
LOG_FILE = os.path.join(DEST_DIR, "sync_log.txt")

EXCLUDE_DIRS = ['.git', 'node_modules', '__pycache__', '.venv', 'venv', '.idea', '.vscode']
EXCLUDE_FILES = ['Thumbs.db', '*.pyc']

def log(message):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = "[{}] {}".format(timestamp, message)
    print(log_msg)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(log_msg + '\n')

def run_cmd(cmd, cwd=None):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, 
                                cwd=cwd, encoding='utf-8', errors='replace')
        return result.returncode, result.stdout.strip() if result.stdout else "", result.stderr.strip() if result.stderr else ""
    except Exception as e:
        return -1, "", str(e)

def main():
    log("\n========== 开始同步任务 ==========")
    log("源目录: " + SRC_DIR)
    log("目标目录: " + DEST_DIR)
    
    # 确保目标目录存在
    if not os.path.exists(DEST_DIR):
        log("创建目标目录...")
        os.makedirs(DEST_DIR, exist_ok=True)
    
    # Robocopy同步
    exclude_dirs = '/XD ' + ' '.join(EXCLUDE_DIRS)
    exclude_files = '/XF ' + ' '.join(EXCLUDE_FILES)
    
    cmd = 'robocopy "{}" "{}" /E /FFT /NFL /NDL /NJH /NJS {} {}'.format(
        SRC_DIR, DEST_DIR, exclude_dirs, exclude_files)
    
    log("执行文件同步...")
    ret, out, err = run_cmd(cmd)
    
    if ret <= 7:
        log("文件同步成功 (返回码: {})".format(ret))
    elif ret == 8:
        log("文件同步部分成功 (返回码: 8)")
    else:
        log("文件同步失败 (返回码: {})".format(ret))
        return ret
    
    # Git操作
    log("\n========== 开始Git操作 ==========")
    
    original_dir = os.getcwd()
    os.chdir(DEST_DIR)
    
    try:
        # 初始化git仓库（如果还不存在）
        if not os.path.exists(".git"):
            log("初始化Git仓库...")
            run_cmd("git init", DEST_DIR)
            run_cmd("git add .", DEST_DIR)
        
        # 配置git用户
        run_cmd('git config user.name "AutoSync"', DEST_DIR)
        run_cmd('git config user.email "auto-sync@example.com"', DEST_DIR)
        
        # 添加所有更改
        log("执行 git add -A ...")
        ret, out, err = run_cmd("git add -A")
        
        # 检查是否有更改
        ret2, status_out, _ = run_cmd("git status --porcelain")
        has_changes = (ret2 == 0) and (status_out and len(status_out.strip()) > 0)
        
        if has_changes:
            commit_msg = "Auto sync: {}".format(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            
            log("有更改，执行提交...")
            ret3, out3, err3 = run_cmd('git commit -m "{}"'.format(commit_msg))
            
            if ret3 == 0:
                log("提交成功")
                
                log("执行 git push ...")
                ret4, out4, err4 = run_cmd("git push")
                
                if ret4 == 0:
                    log("推送成功")
                else:
                    log("推送失败 (可能需要配置remote或认证)")
                    log("手动操作: cd {} && git push".format(DEST_DIR))
            else:
                log("提交失败: {}".format(err3 or out3))
        else:
            log("没有需要提交的更改")
        
    finally:
        os.chdir(original_dir)
    
    log("\n========== 任务完成 ==========")
    return 0

if __name__ == "__main__":
    sys.exit(main())