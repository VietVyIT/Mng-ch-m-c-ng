import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        content = f.read()

    with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    print("Success: Removed BOM and set LF line endings.")

process_file('d:/Phát đồng phục/management/nginx/nginx.conf')
