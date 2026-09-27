import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    old_str = '''    const base64Data = rows[0].image.toString('base64');
    const mime = rows[0].image_mime || 'image/jpeg';
    return response.json({ success: true, data: data:;base64, });'''

    new_str = '''    let imgData = rows[0].image;
    if (imgData instanceof Buffer) {
      imgData = imgData.toString('utf-8');
    }
    if (typeof imgData === 'string' && imgData.startsWith('data:image/')) {
      return response.json({ success: true, data: imgData });
    }
    const base64Data = rows[0].image.toString('base64');
    const mime = rows[0].image_mime || 'image/jpeg';
    return response.json({ success: true, data: data:;base64, });'''

    new_content = content.replace(old_str, new_str)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")

process_file('d:/Phát đồng phục/management/server/src/routes/admin.routes.js')
