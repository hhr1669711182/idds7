import os, shutil, time

src = r'D:\work\telewave\ids\ids-gis-web'
dst = r'C:\Users\16697\Desktop\github\TW\idds7'
excluded_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'venv', '.idea', '.vscode'}
excluded_ext = ('.pyc', '.pyo')
excluded_files = {'Thumbs.db'}

added = 0
updated = 0
skipped = 0
deleted = 0

for root, dirs, files in os.walk(src):
    rel = os.path.relpath(root, src)
    dirs[:] = [d for d in dirs if d not in excluded_dirs]
    for f in files:
        if f in excluded_files or f.endswith(excluded_ext):
            skipped += 1
            continue
        src_path = os.path.join(root, f)
        dst_path = os.path.join(dst, rel, f)
        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        src_mtime = os.path.getmtime(src_path)
        if os.path.exists(dst_path):
            dst_mtime = os.path.getmtime(dst_path)
            if src_mtime > dst_mtime:
                shutil.copy2(src_path, dst_path)
                updated += 1
            else:
                skipped += 1
        else:
            shutil.copy2(src_path, dst_path)
            added += 1

for root, dirs, files in os.walk(dst):
    dirs[:] = [d for d in dirs if d not in excluded_dirs]
    for f in files:
        if f in excluded_files or f.endswith(excluded_ext):
            continue
        rel = os.path.relpath(root, dst)
        src_path = os.path.join(src, rel)
        if not os.path.exists(src_path):
            os.remove(os.path.join(root, f))
            deleted += 1

print(f'added={added} updated={updated} deleted={deleted} skipped={skipped}')
