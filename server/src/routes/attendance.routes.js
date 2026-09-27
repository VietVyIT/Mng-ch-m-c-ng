import express from 'express';
import db from '../config/database.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Hàm hỗ trợ đổi giờ ra số phút để so sánh
const toMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.slice(0, 5).split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
};

// 1. API CHECK-IN
router.post('/check-in', authenticate, async (req, res) => {
  try {
    const { image, imageData, shift = 'MORNING', mssv, fullName, client_time, client_date } = req.body;
    const finalImage = image || imageData || null;
    const userMssv = mssv || req.user?.mssv || req.user?.username || 'N/A';
    const userName = fullName || req.user?.fullName || req.user?.name || 'Sinh viên';

    const checkTime = client_time || new Date().toLocaleTimeString('en-GB', { hour12: false });
    const checkDate = client_date || new Date().toISOString().slice(0, 10);
    const fullDateTime = `${checkDate} ${checkTime}`;

    let isLate = 0;
    let lateMinutes = 0;

    // Truy vấn bảng 'shifts' (TUYỆT ĐỐI KHÔNG GỌI morning_enabled)
    try {
      const [shifts] = await db.query('SELECT * FROM shifts WHERE id = ?', [shift]);
      if (shifts.length > 0) {
        if (!Boolean(shifts[0].is_active)) {
          return res.status(400).json({ success: false, message: `Ca ${shifts[0].name} hiện đang đóng!` });
        }
        const curMin = toMinutes(checkTime);
        const startMin = toMinutes(shifts[0].start_time);
        if (curMin > startMin) {
          isLate = 1;
          lateMinutes = curMin - startMin;
        }
      }
    } catch (e) {
      console.warn("Bỏ qua lỗi kiểm tra ca:", e.message);
    }

    await db.query(
      `INSERT INTO attendance_logs 
       (mssv, full_name, shift, work_date, check_in_time, check_in_image, status, is_late, late_minutes)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
      [userMssv, userName, shift, checkDate, fullDateTime, finalImage, isLate, lateMinutes]
    );

    return res.status(200).json({
      success: true,
      message: isLate ? `Check-in thành công (Trễ ${lateMinutes} phút)` : 'Check-in đúng giờ thành công!'
    });
  } catch (error) {
    console.error("CHECK-IN ERROR:", error);
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
  }
});

// 2. API CHECK-OUT
router.post('/check-out', authenticate, async (req, res) => {
  try {
    const { image, imageData, shift = 'MORNING', mssv, fullName, client_time, client_date } = req.body;
    const finalImage = image || imageData || null;
    const userMssv = mssv || req.user?.mssv || req.user?.username || 'N/A';
    const userName = fullName || req.user?.fullName || req.user?.name || 'Sinh viên';

    const checkTime = client_time || new Date().toLocaleTimeString('en-GB', { hour12: false });
    const checkDate = client_date || new Date().toISOString().slice(0, 10);
    const fullDateTime = `${checkDate} ${checkTime}`;

    // Kiểm tra giờ check-out từ bảng 'shifts'
    try {
      const [shifts] = await db.query('SELECT * FROM shifts WHERE id = ?', [shift]);
      if (shifts.length > 0 && shifts[0].end_time) {
        const curMin = toMinutes(checkTime);
        const endMin = toMinutes(shifts[0].end_time);
        if (curMin < endMin) {
          return res.status(400).json({
            success: false,
            message: `Chưa đến giờ kết thúc ca (${shifts[0].end_time}). Không thể check-out trước giờ!`
          });
        }
      }
    } catch (e) {
      console.warn("Bỏ qua lỗi kiểm tra giờ ra:", e.message);
    }

    const [rows] = await db.query(
      `SELECT id FROM attendance_logs 
       WHERE (mssv = ? OR full_name = ?) AND work_date = ?
       ORDER BY id DESC LIMIT 1`,
      [userMssv, userName, checkDate]
    );

    if (rows.length === 0) {
      await db.query(
        `INSERT INTO attendance_logs 
         (mssv, full_name, shift, work_date, check_out_time, check_out_image, status)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
        [userMssv, userName, shift, checkDate, fullDateTime, finalImage]
      );
    } else {
      await db.query(
        `UPDATE attendance_logs 
         SET check_out_time = ?, check_out_image = ? 
         WHERE id = ?`,
        [fullDateTime, finalImage, rows[0].id]
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Xác nhận check-out thành công! Chờ Admin phê duyệt.'
    });
  } catch (error) {
    console.error("CHECK-OUT ERROR:", error);
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
  }
});

// APIs fallback to handle GET/PUT shifts if needed, to prevent routing errors if they call it on attendance route.
router.get('/shifts', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM shifts');
    res.json({ success: true, data: rows });
  } catch (e) {
    res.json({ success: false, data: [] });
  }
});

export default router;
