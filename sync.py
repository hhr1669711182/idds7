import shutil, os

src = r'D:\work\telewave\ids\ids-gis-web'
dst = r'C:\Users\16697\Desktop\github\TW\idds7'

excluded_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'venv', '.idea', '.vscode'}
excluded_files = {'Thumbs.db'}
excluded_exts = {'.pyc'}

count = 0
for root, dirs, files in os.walk(src):
    dirs[:] = [d for d in dirs if d not in excluded_dirs]
    rel = os.path.relpath(root, src)
    dst_root = os.path.join(dst, rel) if rel != '.' else dst
    os.makedirs(dst_root, exist_ok=True)
    for f in files:
        if f in excluded_files:
            continue
        if os.path.splitext(f)[1].lower() in excluded_exts:
            continue
        src_file = os.path.join(root, f)
        dst_file = os.path.join(dst_root, f)
        shutil.copy2(src_file, dst_file)
        count += 1

print(f'DONE:{count}')