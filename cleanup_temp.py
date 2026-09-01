import os
base = r'C:\Users\16697\Desktop\github\TW\idds7'
for f in ['check_output.txt', 'src_head.txt', 'src_status.txt', 'dst_head.txt', 'dst_status.txt']:
    fp = os.path.join(base, f)
    if os.path.exists(fp):
        os.remove(fp)
        print(f'Removed: {f}')
    else:
        print(f'Not found: {f}')
