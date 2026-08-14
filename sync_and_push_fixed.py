# -*- coding: utf-8 -*-
"""
Sync and push script.
"""

import os
import shutil
import subprocess
import time
from datetime import datetime

SRC = r"D:\work\telewave\ids\ids-gis-web"
DST = r"C:\Users\16697\Desktop\github\TW\idds7"
LOG = os.path.join(SRC, "sync_log.txt")

EXCLUDE_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv", ".idea", ".vscode"}
EXCLUDE_FILES = {"Thumbs.db"}

def should_exclude(name):
    if name in EXCLUDE_DIRS:
        return True
    if name in EXCLUDE_FILES:
        return True
    if name.endswith(".pyc"):
        return True
    return False

def log(msg):
    print(msg)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat()}  {msg}\n")

def copy_tree(src, dst):
    copied = []
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if not should_exclude(d)]
        rel_root = os.path.relpath(root, src)
        dst_root = os.path.join(dst, rel_root) if rel_root != "." else dst
        os.makedirs(dst_root, exist_ok=True)
        for f in files:
            if should_exclude(f):
                continue
            src_file = os.path.join(root, f)
            dst_file = os.path.join(dst_root, f)
            shutil.copy2(src_file, dst_file)
            copied.append(rel_root + os.sep + f)
    return copied

def git_run(cmd, cwd=None):
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True, encoding="utf-8")
    if result.stdout:
        log(f"  git {cmd}: {result.stdout.strip()}")
    if result.stderr:
        log(f"  git {cmd} (stderr): {result.stderr.strip()}")
    return result.returncode

def main():
    start = time.time()
    log(f"\n{'='*60}")
    log(f"Sync started at {datetime.now().isoformat()}")
    log(f"Source: {SRC}")
    log(f"Target: {DST}")
    log(f"{'='*60}")

    log("Copying files...")
    copied = copy_tree(SRC, DST)
    log(f"Copied {len(copied)} files/dirs")

    log("\nRunning git operations...")
    rc = git_run("git add -A", cwd=DST)
    log(f"git add -A exit code: {rc}")

    result = subprocess.run("git status --porcelain", shell=True, cwd=DST,
                            capture_output=True, text=True, encoding="utf-8")
    status = result.stdout.strip()
    if not status:
        log("No changes to commit.")
    else:
        count = len([l for l in status.splitlines() if l.strip()])
        log(f"Changes detected: {count} file(s)")
        rc = git_run('git commit -m "Sync from ids-gis-web"', cwd=DST)
        log(f"git commit exit code: {rc}")
        if rc == 0:
            rc = git_run("git push", cwd=DST)
            log(f"git push exit code: {rc}")

    elapsed = time.time() - start
    log(f"\nSync completed in {elapsed:.1f}s at {datetime.now().isoformat()}")
    print(f"\nDone. Log: {LOG}")

if __name__ == "__main__":
    main()