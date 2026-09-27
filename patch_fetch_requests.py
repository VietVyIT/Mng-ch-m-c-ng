import sys
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_fetch = '''
async function fetchAttendanceRequests(filter = 'all') {
  let whereClause = "WHERE status = 'PENDING'";
  if (filter === 'late') {
    whereClause += " AND is_late = 1";
  } else if (filter === 'ontime') {
    whereClause += " AND is_late = 0";
  }

  const [rows] = await pool.execute(
    SELECT 
      id, id AS event_id,
      COALESCE(mssv, 'N/A') AS mssv, 
      COALESCE(mssv, 'N/A') AS student_code,
      COALESCE(mssv, 'N/A') AS username,
      COALESCE(full_name, 'Sinh viên') AS full_name, 
      COALESCE(shift, 'MORNING') AS shift, 
      COALESCE(shift, 'MORNING') AS shift_name, 
      work_date, 
      work_date AS attendance_date,
      check_in_time, 
      check_in_time AS captured_at,
      check_out_time, 
      check_in_image, 
      check_out_image, 
      status, 
      is_late, 
      IF(is_late, 'LATE', 'ON_TIME') AS punctuality_status,
      late_minutes 
    FROM attendance_logs 
    
    ORDER BY check_in_time DESC
  );

  return rows;
}
'''

    # Find the start and end of fetchAttendanceRequests
    start_idx = content.find('async function fetchAttendanceRequests')
    if start_idx != -1:
        end_idx = content.find('}', content.find('}', content.find('}', start_idx) + 1) + 1) + 1
        content = content[:start_idx] + new_fetch.strip() + '\n' + content[end_idx:]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")

process_file('d:/Phát đồng phục/management/server/src/routes/admin.routes.js')
