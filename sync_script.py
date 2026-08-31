import os
import shutil
from pathlib import Path

def sync_folders(src, dst):
    src_path = Path(src)
    dst_path = Path(dst)
    
    # Directories to exclude
    exclude_dirs = {'.git', 'node_modules', '__pycache__', '.venv', 'venv', '.idea', '.vscode'}
    # Files to exclude
    exclude_files = {'Thumbs.db'}
    # Extensions to exclude
    exclude_extensions = {'.pyc'}
    
    total_copied = 0
    
    for root, dirs, files in os.walk(src_path):
        # Check if any parent directory is in exclude list
        rel_path = Path(root).relative_to(src_path)
        exclude = False
        for part in rel_path.parts:
            if part in exclude_dirs:
                exclude = True
                break
        if exclude:
            continue
            
        # Update dirs in-place to skip excluded subdirectories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        target_root = dst_path / rel_path
        target_root.mkdir(parents=True, exist_ok=True)
        
        for file in files:
            if file in exclude_files:
                continue
            if Path(file).suffix in exclude_extensions:
                continue
                
            src_file = os.path.join(root, file)
            dst_file = os.path.join(target_root, file)
            
            # Copy if newer or doesn't exist
            try:
                if not os.path.exists(dst_file) or os.path.getmtime(src_file) > os.path.getmtime(dst_file):
                    shutil.copy2(src_file, dst_file)
                    total_copied += 1
            except Exception as e:
                print(f"Error copying {src_file}: {e}")
                
    return total_copied

if __name__ == "__main__":
    src_dir = r"D:\work\telewave\ids\ids-gis-web"
    dst_dir = r"C:\Users\16697\Desktop\github\TW\idds7"
    
    print(f"Syncing {src_dir} to {dst_dir}")
    count = sync_folders(src_dir, dst_dir)
    print(f"Synced {count} files")
