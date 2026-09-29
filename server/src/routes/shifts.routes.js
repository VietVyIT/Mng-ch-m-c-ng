import express from 'express';
import { pool } from '../config/database.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const router = express.Router();

const shiftNames = {
  MORNING: 'Ca Sáng',
  AFTERNOON: 'Ca Chiều',
  EVENING: 'Ca Tối',
};

router.get('/', async (request, response, next) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, start_time, end_time, is_active FROM shifts ORDER BY FIELD(id, "MORNING", "AFTERNOON", "EVENING")');
    if (!rows.length) throw new Error('Không tìm thấy ca làm việc nào trong hệ thống.');
    return response.json({
      success: true,
      data: rows.map((shift) => ({ ...shift, name: shiftNames[shift.id] || shift.name })),
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', authenticate, authorize('ADMIN'), async (request, response, next) => {
  try {
    const { name, start_time, end_time, is_active } = request.body;
    const startTime = String(start_time || '');
    const endTime = String(end_time || '');
    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;
    const startMatch = startTime.match(timePattern);
    const endMatch = endTime.match(timePattern);
    const toSeconds = (match) => Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);

    if (typeof name !== 'string' || !name.trim()) {
      return response.status(400).json({ success: false, message: 'Tên ca làm việc không được để trống.' });
    }
    if (!startMatch || !endMatch) {
      return response.status(400).json({ success: false, message: 'Giờ bắt đầu và kết thúc phải đúng định dạng HH:mm.' });
    }
    if (toSeconds(endMatch) <= toSeconds(startMatch)) {
      return response.status(400).json({ success: false, message: 'Giờ kết thúc phải sau giờ bắt đầu.' });
    }
    if (typeof is_active !== 'boolean') {
      return response.status(400).json({ success: false, message: 'Trạng thái ca làm việc không hợp lệ.' });
    }

    const [existingShifts] = await pool.execute('SELECT id FROM shifts WHERE id = ?', [request.params.id]);
    if (!existingShifts.length) {
      return response.status(404).json({ success: false, message: 'Không tìm thấy ca làm việc.' });
    }

    await pool.execute(
      'UPDATE shifts SET name = ?, start_time = ?, end_time = ?, is_active = ? WHERE id = ?',
      [name.trim(), startTime, endTime, is_active ? 1 : 0, request.params.id]
    );
    return response.json({ success: true, message: 'Cập nhật ca làm việc thành công.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
