import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_routes = """
// Thêm lại các route GET bị thiếu
router.get('/today', authenticate, async (req, res) => {
  try {
    const userMssv = req.user?.mssv || req.user?.username;
    const [rows] = await db.query(
      `SELECT id, work_date as attendance_date, shift as shift_code, shift as shift_name,
              check_in_time as check_in, check_out_time as check_out, status, is_late, late_minutes
       FROM attendance_logs 
       WHERE mssv = ? AND work_date = CURRENT_DATE 
       ORDER BY check_in_time DESC LIMIT 1`,
      [userMssv]
    );
    return res.json({ success: true, data: rows[0] || null });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/shifts/today', authenticate, async (req, res) => {
  try {
    const [shifts] = await db.query('SELECT * FROM shifts WHERE is_active = 1');
    return res.json({ success: true, data: { shifts } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/my', authenticate, async (req, res) => {
  try {
    const userMssv = req.user?.mssv || req.user?.username;
    const [rows] = await db.query(
      `SELECT id, work_date as attendance_date, shift as shift_code, shift as shift_name,
              check_in_time as check_in, check_out_time as check_out, status, is_late, late_minutes,
              IF(check_in_image IS NOT NULL, 1, 0) as check_in_photo_available,
              IF(check_out_image IS NOT NULL, 1, 0) as check_out_photo_available
       FROM attendance_logs 
       WHERE mssv = ? 
       ORDER BY work_date DESC, check_in_time DESC LIMIT 100`,
      [userMssv]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
"""

    start_idx = content.find('// Thêm lại các route GET bị thiếu')
    if start_idx != -1:
        content = content[:start_idx]

    content = content + new_routes

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")

process_file('d:/Phát đồng phục/management/server/src/routes/attendance.routes.js')
