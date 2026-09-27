import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_fetch = '''
async function serveApprovalImage(request, response, next) {
  try {
    const eventId = request.params.id || request.params.eventId;
    const [rows] = await pool.execute(
      'SELECT check_in_image, check_out_image FROM attendance_logs WHERE id = ? LIMIT 1',
      [eventId],
    );
    const image = rows[0]?.check_in_image || rows[0]?.check_out_image;
    if (!image) return response.status(404).json({ success: false, message: 'Ảnh đã hết hạn hoặc không tồn tại.' });
    return response.json({ success: true, data: image });
  } catch (error) {
    return next(error);
  }
}
'''
    start_idx = content.find('async function serveApprovalImage')
    if start_idx != -1:
        end_idx = content.find('}', content.find('}', content.find('}', start_idx) + 1) + 1) + 1
        content = content[:start_idx] + new_fetch.strip() + '\n' + content[end_idx:]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")

process_file('d:/Phát đồng phục/management/server/src/routes/admin.routes.js')
