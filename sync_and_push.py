# -*- coding: utf-8 -*-
import os
import sys
import subprocess
from datetime import datetime

# 配置 - 使用原始字符串避免转义问题
SRC_DIR = r"D:\work\telewave\ids\ids-gis-web"
DEST_DIR = r"C:\Users\16697\Desktop\github\TW\idds7"
LOG_FILE = os.path.join(SRC_DIR, "sync_log.txt")

# 要排除的目录和文件模式
EXCLUDE_DIRS = ['.git', 'node_modules', '__pycache__', '.venv', 'venv', '.idea', '.vscode']
EXCLUDE_FILES = ['Thumbs.db', '*.pyc']

def log(message, log_file=None):
    """打印并记录日志"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_msg = "[{}] {}".format(timestamp, message)
    print(log_msg)
    
    if log_file:
        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(log_msg + '\n')

def run_command(cmd, cwd=None, capture=True):
    """运行命令并返回结果"""
    try:
        result = subprocess.run(
            cmd, 
            shell=True, 
            capture_output=capture,
            text=True,
            cwd=cwd,
            encoding='utf-8',
            errors='replace'
        )
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        return -1, "", str(e)

def sync_files():
    """使用robocopy同步文件"""
    log("=== 开始文件同步 ===", LOG_FILE)
    
    # 检查源目录
    if not os.path.exists(SRC_DIR):
        log("错误: 源目录不存在: {}".format(SRC_DIR), LOG_FILE)
        return False
    
    # 确保目标目录存在
    os.makedirs(DEST_DIR, exist_ok=True)
    log("目标目录: {}".format(DEST_DIR), LOG_FILE)
    
    # 构建robocopy命令
    exclude_dirs_str = ' /XD ' + ' '.join(EXCLUDE_DIRS)
    exclude_files_str = ' /XF ' + ' '.join(EXCLUDE_FILES)
    
    robocopy_log = os.path.join(SRC_DIR, "robocopy.log")
    cmd = 'robocopy "{}" "{}" /E /FFT /NFL /NDL /NJH /NJS /LOG:"{}" {} {}'.format(
        SRC_DIR, DEST_DIR, robocopy_log, exclude_dirs_str, exclude_files_str
    )
    
    log("执行命令: {}".format(cmd), LOG_FILE)
    
    returncode, stdout, stderr = run_command(cmd)
    
    # robocopy返回码: 0-7成功, 8失败
    if returncode <= 7:
        log("同步完成 (返回码: {})".format(returncode), LOG_FILE)
        return True
    elif returncode == 8:
        log("同步完成但有错误 (返回码: {})".format(returncode), LOG_FILE)
        return True
    else:
        log("同步失败 (返回码: {})".format(returncode), LOG_FILE)
        return False

def git_operations():
    """执行Git操作"""
    log("=== 开始Git操作 ===", LOG_FILE)
    
    original_dir = os.getcwd()
    os.chdir(DEST_DIR)
    
    try:
        # 初始化git仓库（如果还不存在）
        if not os.path.exists(".git"):
            log("初始化Git仓库...", LOG_FILE)
            run_command("git init", DEST_DIR, LOG_FILE)
            run_command("git add .", DEST_DIR, LOG_FILE)
        
        # 配置git用户
        run_command('git config user.name "AutoSync"', DEST_DIR, LOG_FILE)
        run_command('git config user.email "auto-sync@example.com"', DEST_DIR, LOG_FILE)
        
        # 添加所有更改
        log("执行 git add -A ...", LOG_FILE)
        returncode, stdout, stderr = run_command("git add -A", DEST_DIR, False)
        
        # 检查是否有更改
        status_return, status_out, _ = run_command("git status --porcelain", DEST_DIR, False)
        has_changes = status_return == 0 and status_out.strip() != ""
        
        if has_changes:
            # 生成提交信息
            commit_msg = "Auto sync: {}".format(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            
            log("有更改，执行提交: {}".format(commit_msg), LOG_FILE)
            returncode, stdout, stderr = run_command('git commit -m "{}"'.format(commit_msg), DEST_DIR, False)
            
            if returncode == 0:
                log("提交成功", LOG_FILE)
                
                # 推送到远程
                log("执行 git push ...", LOG_FILE)
                returncode, stdout, stderr = run_command("git push", DEST_DIR, False)
                
                if returncode == 0:
                    log("推送成功", LOG_FILE)
                    return True
                else:
                    log("推送失败，请检查远程配置: {}".format(stderr or stdout), LOG_FILE)
                    log("提示: 手动执行 cd {} && git push".format(DEST_DIR), LOG_FILE)
                    return False
            else:
                log("提交失败: {}".format(stderr or stdout), LOG_FILE)
                return False
        else:
            log("没有需要提交的更改", LOG_FILE)
            return True
            
    except Exception as e:
        log("Git操作错误: {}".format(e), LOG_FILE)
        return False
    finally:
        os.chdir(original_dir)

def main():
    """主函数"""
    log("\n" + "="*50, LOG_FILE)
    log("开始同步任务", LOG_FILE)
    log("源目录: {}".format(SRC_DIR), LOG_FILE)
    log("目标目录: {}".format(DEST_DIR), LOG_FILE)
    log("="*50 + "\n", LOG_FILE)
    
    # 执行同步
    sync_success = sync_files()
    
    # 执行Git操作
    git_success = git_operations() if sync_success else False
    
    # 总结
    log("\n" + "="*50, LOG_FILE)
    if sync_success and git_success:
        log("任务完成：同步和Git操作均成功", LOG_FILE)
    elif sync_success and not git_success:
        log("任务部分完成：同步成功，但Git操作失败", LOG_FILE)
    else:
        log("任务完成但有错误：同步或Git操作失败", LOG_FILE)
    log("="*50 + "\n", LOG_FILE)
    
    return 0 if (sync_success and git_success) else 1

if __name__ == "__main__":
    sys.exit(main())