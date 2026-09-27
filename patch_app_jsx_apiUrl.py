import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = content.replace('const apiUrl = configuredApiUrl || (import.meta.env.PROD ? \'/api\' : "http://:5000/api");', 'const apiUrl = configuredApiUrl || (import.meta.env.PROD ? \'/api\' : http://:5000/api);')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")

process_file('d:/Phát đồng phục/management/client/src/App.jsx')
