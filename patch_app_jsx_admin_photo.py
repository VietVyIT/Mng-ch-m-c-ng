import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Modify ApprovalRow
    old_approval_photo = '<button className="approval-photo" onClick={onPreview} aria-label="Xem ảnh đối soát">Ảnh</button>'
    new_approval_photo = '''{event.check_in_image ? (
        <img src={event.check_in_image} alt="Minh chứng" className="approval-photo-img" onClick={() => onPreview(event.event_id)} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }} />
      ) : (
        <div className="approval-photo-placeholder" style={{ width: '40px', height: '40px', background: '#eee', color: '#888', borderRadius: '4px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '2px', flexShrink: 0 }}>Không có ảnh</div>
      )}'''
    content = content.replace(old_approval_photo, new_approval_photo)

    # Modify AllRequestsModal table cell
    old_table_btn = '<button className="icon-btn-view" onClick={() => onPreview(item.event_id)}>👁️ Xem ảnh</button>'
    new_table_btn = '''{item.check_in_image ? (
                                <button className="icon-btn-view" onClick={() => onPreview(item.event_id)}>👁️ Xem ảnh</button>
                              ) : (
                                <span style={{ fontSize: '12px', color: '#888' }}>Không có ảnh minh chứng</span>
                              )}'''
    content = content.replace(old_table_btn, new_table_btn)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")

process_file('d:/Phát đồng phục/management/client/src/App.jsx')
