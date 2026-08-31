@echo off
python "%~dp0sync_script.py"
echo Sync complete. Now committing and pushing...
git add -A
git commit -m "Auto-sync from D:\work\telewave\ids\ids-gis-web"
git push
echo Done.
