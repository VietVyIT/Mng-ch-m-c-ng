import express from 'express';
import { pool } from '../config/database.js';

const router = express.Router();

router.get('/', async (request, response) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, start_time, end_time, is_active FROM shifts ORDER BY FIELD(id, "MORNING", "AFTERNOON", "EVENING")');
    if (!rows || rows.length === 0) {
      throw new Error('Empty database table');
    }
    return response.json({ success: true, data: rows });
  } catch (error) {
    return response.json({
      success: true,
      data: [
        { id: 'MORNING', name: 'Ca Sáng', start_time: '07:30', end_time: '12:00', is_active: true },
        { id: 'AFTERNOON', name: 'Ca Chiều', start_time: '13:30', end_time: '17:30', is_active: true },
        { id: 'EVENING', name: 'Ca Tối', start_time: '18:00', end_time: '20:00', is_active: false }
      ]
    });
  }
});

router.put('/:id', async (request, response) => {
  try {
    const { name, start_time, end_time, is_active } = request.body;
    await pool.execute(
      'UPDATE shifts SET name = ?, start_time = ?, end_time = ?, is_active = ? WHERE id = ?',
      [name, start_time, end_time, is_active ? 1 : 0, request.params.id]
    );
    return response.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) {
    return response.status(500).json({ success: false, message: 'Lỗi server' });
  }
});

export default router;
