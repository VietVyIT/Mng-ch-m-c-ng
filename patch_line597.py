import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = content.replace('''<button className="checkout-button face-action"  onClick={() => {
  if (checkedIn && realtimeShift?.end) {''', '''<button className="checkout-button face-action"  onClick={() => {
  if (!checkedIn && !realtimeShift) { alert('Hiện tại không có ca làm việc nào đang mở.'); return; }
  if (checkedIn && realtimeShift?.end) {''')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")

process_file('d:/Phát đồng phục/management/client/src/App.jsx')
