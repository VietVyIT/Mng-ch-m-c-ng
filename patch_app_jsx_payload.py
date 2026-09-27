import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the payload inside handleFaceSuccess
    old_payload1 = "JSON.stringify({ embedding, imageData, client_time, client_date })"
    new_payload1 = "JSON.stringify({ embedding, imageData, image: imageData, check_in_image: imageData, shift: realtimeShift?.code || 'MORNING', mssv: user?.mssv, fullName: user?.fullName || user?.name, client_time, client_date })"
    
    content = content.replace(old_payload1, new_payload1)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")

process_file('d:/Phát đồng phục/management/client/src/App.jsx')
