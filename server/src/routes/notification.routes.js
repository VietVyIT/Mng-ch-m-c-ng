import { Router } from 'express';
import { pool } from '../config/database.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();
router.use(authenticate);

router.get('/', async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, type, title, message, date_info, reason, is_read, created_at
       FROM notifications WHERE recipient_id = ?
       ORDER BY created_at DESC LIMIT 50`,
      [request.user.userId],
    );
    const [unread] = await pool.execute(
      'SELECT COUNT(*) AS count FROM notifications WHERE recipient_id = ? AND is_read = FALSE',
      [request.user.userId],
    );
    return response.json({ success: true, data: rows, unreadCount: Number(unread[0].count) });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/read', async (request, response, next) => {
  try {
    await pool.execute(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND recipient_id = ?',
      [request.params.id, request.user.userId],
    );
    return response.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.patch('/read-all', async (request, response, next) => {
  try {
    await pool.execute(
      'UPDATE notifications SET is_read = TRUE WHERE recipient_id = ? AND is_read = FALSE',
      [request.user.userId],
    );
    return response.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
