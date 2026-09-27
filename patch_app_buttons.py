import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the button at line 597
    old_btn1 = '''<button className="checkout-button face-action" disabled={!realtimeShift} onClick={() => {
  if (checkedIn && realtimeShift?.end) {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const [endHours, endMinutes] = realtimeShift.end.split(':').map(Number);
    const currentTime = currentHours * 60 + currentMinutes;
    const endTime = endHours * 60 + endMinutes;
    if (currentTime < endTime) {
      alert(Chưa đến giờ kết thúc ca làm việc (). Bạn không thể check-out trước giờ!);
      return;
    }
  }
  setFaceModal(true);
}}>'''
    
    new_btn1 = '''<button className="checkout-button face-action" onClick={() => {
  if (!realtimeShift) {
    alert('Hiện tại không có ca làm việc nào đang mở.');
    return;
  }
  if (checkedIn && realtimeShift?.end) {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const [endHours, endMinutes] = realtimeShift.end.split(':').map(Number);
    const currentTime = currentHours * 60 + currentMinutes;
    const endTime = endHours * 60 + endMinutes;
    if (currentTime < endTime) {
      alert(Chưa đến giờ kết thúc ca làm việc (). Bạn không thể check-out trước giờ!);
      return;
    }
  }
  setCameraError('');
  setCameraState('loading');
  setFaceModal(true);
}}>'''

    # Find the button at line 780
    old_btn2 = '''<button className="checkout-button face-action" disabled={!checkedIn && !realtimeShift} onClick={() => {
  if (checkedIn && realtimeShift?.end) {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const [endHours, endMinutes] = realtimeShift.end.split(':').map(Number);
    const currentTime = currentHours * 60 + currentMinutes;
    const endTime = endHours * 60 + endMinutes;
    if (currentTime < endTime) {
      alert(Chưa đến giờ kết thúc ca làm việc (). Bạn không thể check-out trước giờ!);
      return;
    }
  }
  if (!checkedIn && !realtimeShift) {
    return;
  }
  setFaceModal(true);
}}>'''

    new_btn2 = '''<button className="checkout-button face-action" onClick={() => {
  if (!checkedIn && !realtimeShift) {
    alert('Hiện tại không có ca làm việc nào đang mở.');
    return;
  }
  if (checkedIn && realtimeShift?.end) {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const [endHours, endMinutes] = realtimeShift.end.split(':').map(Number);
    const currentTime = currentHours * 60 + currentMinutes;
    const endTime = endHours * 60 + endMinutes;
    if (currentTime < endTime) {
      alert(Chưa đến giờ kết thúc ca làm việc (). Bạn không thể check-out trước giờ!);
      return;
    }
  }
  setCameraError('');
  setCameraState('loading');
  setFaceModal(true);
}}>'''

    # Find the button at line 1124
    old_btn3 = '''<button
              className="checkout-button face-action"
              disabled={!checkedIn && !realtimeShift}
              onClick={() => {
                if (checkedIn && realtimeShift?.end) {
                  const now = new Date();
                  const currentHours = now.getHours();
                  const currentMinutes = now.getMinutes();
                  const [endHours, endMinutes] = realtimeShift.end.split(':').map(Number);
                  
                  const currentTime = currentHours * 60 + currentMinutes;
                  const endTime = endHours * 60 + endMinutes;
                  if (currentTime < endTime) {
                    alert(Chưa đến giờ kết thúc ca làm việc (). Bạn không thể check-out trước giờ!);
                    return;
                  }
                }
                if (!checkedIn && !realtimeShift) {
                  return;
                }
                setFaceModal(true);
              }}
            >'''

    new_btn3 = '''<button
              className="checkout-button face-action"
              onClick={() => {
                if (!checkedIn && !realtimeShift) {
                  alert('Hiện tại không có ca làm việc nào đang mở.');
                  return;
                }
                if (checkedIn && realtimeShift?.end) {
                  const now = new Date();
                  const currentHours = now.getHours();
                  const currentMinutes = now.getMinutes();
                  const [endHours, endMinutes] = realtimeShift.end.split(':').map(Number);
                  
                  const currentTime = currentHours * 60 + currentMinutes;
                  const endTime = endHours * 60 + endMinutes;
                  if (currentTime < endTime) {
                    alert(Chưa đến giờ kết thúc ca làm việc (). Bạn không thể check-out trước giờ!);
                    return;
                  }
                }
                setCameraError('');
                setCameraState('loading');
                setFaceModal(true);
              }}
            >'''

    new_content = content.replace(old_btn1, new_btn1).replace(old_btn2, new_btn2).replace(old_btn3, new_btn3)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")

process_file('d:/Phát đồng phục/management/client/src/App.jsx')
