import express from 'express';
import { pool } from '../config/database.js';

const router = express.Router();

router.get('/', async (request, response, next) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, start_time, end_time, is_active FROM shifts ORDER BY FIELD(id, "MORNING", "AFTERNOON", "EVENING")');
    if (!rows.length) throw new Error('Không tìm thấy ca làm việc nào trong hệ thống.');
    return response.json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
});

router.put('/:id', async (request, response, next) => {
  try {
    const { name, start_time, end_time, is_active } = request.body;
    const [result] = await pool.execute(
      'UPDATE shifts SET name = ?, start_time = ?, end_time = ?, is_active = ? WHERE id = ?',
      [name, start_time, end_time, is_active ? 1 : 0, request.params.id]
    );
    if (!result.affectedRows) {
      return response.status(404).json({ success: false, message: 'Không tìm thấy ca làm việc.' });
    }
    return response.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) {
    return next(error);
  }
});

export default router;
