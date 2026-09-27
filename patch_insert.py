import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    old_insert = '''        const [insert] = await connection.execute(
          INSERT INTO attendance
           (user_id, attendance_date, shift_code, shift_name, shift_start, shift_end, check_in, status, punctuality_status, is_late, late_minutes, face_verified)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, TRUE),
          [request.user.userId, clientDateStr, shift.code, shift.name, shift.start, shift.end, clientDateTime, checkInLateInfo.punctualityStatus, checkInLateInfo.isLate, checkInLateInfo.lateMinutes],
        );'''

    new_insert = '''        const [insert] = await connection.execute(
          INSERT INTO attendance
           (user_id, attendance_date, shift_code, shift_name, shift_start, shift_end, check_in, check_in_image, status, punctuality_status, is_late, late_minutes, face_verified)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, TRUE),
          [request.user.userId, clientDateStr, shift.code, shift.name, shift.start, shift.end, clientDateTime, rawImageData, checkInLateInfo.punctualityStatus, checkInLateInfo.isLate, checkInLateInfo.lateMinutes],
        );'''
        
    old_update = '''      } else if (eventType === 'CHECK_OUT') {
        await connection.execute(
          "UPDATE attendance SET check_out = ?, total_hours = ROUND(TIMESTAMPDIFF(MINUTE, check_in, ?) / 60, 2), status = 'PENDING' WHERE id = ?",
          [clientDateTime, clientDateTime, attendance.id],
        );
      }'''

    new_update = '''      } else if (eventType === 'CHECK_OUT') {
        await connection.execute(
          "UPDATE attendance SET check_out = ?, check_out_image = ?, total_hours = ROUND(TIMESTAMPDIFF(MINUTE, check_in, ?) / 60, 2), status = 'PENDING' WHERE id = ?",
          [clientDateTime, rawImageData, clientDateTime, attendance.id],
        );
      }'''

    new_content = content.replace(old_insert, new_insert).replace(old_update, new_update)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")

process_file('d:/Phát đồng phục/management/server/src/routes/attendance.routes.js')
