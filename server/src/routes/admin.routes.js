import { Router } from 'express';
import { pool } from '../config/database.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { DEFAULT_SHIFTS } from '../config/shifts.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.post('/announcements', async (request, response, next) => {
  const title = typeof request.body.title === 'string' ? request.body.title.trim().slice(0, 255) : '';
  const message = typeof request.body.message === 'string' ? request.body.message.trim().slice(0, 2000) : '';
  const dateInfo = typeof request.body.dateInfo === 'string' ? request.body.dateInfo.trim().slice(0, 120) : null;
  if (!title || !message) return response.status(400).json({ success: false, message: 'Tiêu đề và nội dung là bắt buộc.' });
  try {
    const [users] = await pool.execute('SELECT id FROM users');
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const user of users) {
        await createNotification(connection, { recipientId: user.id, type: 'SYSTEM_ANNOUNCEMENT', title, message, dateInfo });
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    return response.status(201).json({ success: true, recipientCount: users.length });
  } catch (error) {
    return next(error);
  }
});

router.get('/shifts/:date', async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT setting_date, evening_enabled FROM shift_day_settings WHERE setting_date = ? LIMIT 1',
      [request.params.date],
    );
    return response.json({
      success: true,
      data: { date: request.params.date, eveningEnabled: rows[0]?.evening_enabled !== 0, shifts: DEFAULT_SHIFTS },
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/shifts/:date', async (request, response, next) => {
  try {
    const eveningEnabled = Boolean(request.body.eveningEnabled);
    await pool.execute(
      `INSERT INTO shift_day_settings (setting_date, evening_enabled, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE evening_enabled = VALUES(evening_enabled), updated_by = VALUES(updated_by)`,
      [request.params.date, eveningEnabled, request.user.userId],
    );
    return response.json({ success: true, data: { date: request.params.date, eveningEnabled } });
  } catch (error) {
    return next(error);
  }
});

router.get('/approvals', async (_request, response, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT e.id AS event_id, e.attendance_id, e.event_type, e.captured_at, e.status,
              e.photo_expired, a.attendance_date, a.shift_name, a.shift_start, a.shift_end,
              u.full_name, u.username
       FROM attendance_events e
       JOIN attendance a ON a.id = e.attendance_id
       JOIN users u ON u.id = e.user_id
       WHERE e.status = 'PENDING'
       ORDER BY e.captured_at DESC`,
    );
    return response.json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
});

router.get('/approvals/:eventId/image', async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT image, image_mime FROM attendance_events WHERE id = ? LIMIT 1',
      [request.params.eventId],
    );
    if (!rows[0]?.image) return response.status(404).json({ success: false, message: 'Ảnh đã hết hạn.' });
    return response.type(rows[0].image_mime || 'image/jpeg').send(rows[0].image);
  } catch (error) {
    return next(error);
  }
});

router.get('/attendance', async (_request, response, next) => {
  try {
    await pool.execute(
      `UPDATE attendance_events SET image = NULL, photo_expired = TRUE
       WHERE image IS NOT NULL AND captured_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    );
    const [rows] = await pool.execute(
      `SELECT a.id, a.user_id, a.attendance_date, a.shift_name, a.shift_start, a.shift_end,
              a.check_in, a.check_out, a.total_hours, a.status, a.punctuality_status,
              u.full_name, u.username,
              ci.id AS check_in_event_id, ci.captured_at AS check_in_captured_at,
              ci.status AS check_in_event_status, ci.photo_expired AS check_in_photo_expired,
              (ci.image IS NOT NULL) AS check_in_photo_available,
              co.id AS check_out_event_id, co.captured_at AS check_out_captured_at,
              co.status AS check_out_event_status, co.photo_expired AS check_out_photo_expired,
              (co.image IS NOT NULL) AS check_out_photo_available
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN attendance_events ci ON ci.attendance_id = a.id AND ci.event_type = 'CHECK_IN'
       LEFT JOIN attendance_events co ON co.attendance_id = a.id AND co.event_type = 'CHECK_OUT'
       ORDER BY a.attendance_date DESC, a.check_in DESC, ci.captured_at DESC
       LIMIT 500`,
    );
    return response.json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
});

router.get('/attendance/:attendanceId/image/:type', async (request, response, next) => {
  try {
    const eventType = request.params.type === 'check-in' ? 'CHECK_IN' : request.params.type === 'check-out' ? 'CHECK_OUT' : null;
    if (!eventType) return response.status(400).json({ success: false, message: 'Loại ảnh không hợp lệ.' });
    const [rows] = await pool.execute(
      `SELECT image, image_mime FROM attendance_events
       WHERE attendance_id = ? AND event_type = ? ORDER BY captured_at DESC LIMIT 1`,
      [request.params.attendanceId, eventType],
    );
    if (!rows[0]?.image) return response.status(404).json({ success: false, message: 'Ảnh đã hết hạn hoặc không tồn tại.' });
    return response.type(rows[0].image_mime || 'image/jpeg').send(rows[0].image);
  } catch (error) {
    return next(error);
  }
});

router.delete('/attendance/:attendanceId', async (request, response, next) => {
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim().slice(0, 500) : null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT a.id, a.user_id, a.attendance_date, a.shift_name
       FROM attendance a WHERE a.id = ? LIMIT 1 FOR UPDATE`,
      [request.params.attendanceId],
    );
    if (!rows[0]) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy bản ghi chấm công.' });
    }
    const dateInfo = `${rows[0].shift_name || 'Ca làm việc'} - Ngày ${new Date(rows[0].attendance_date).toLocaleDateString('vi-VN')}`;
    const message = reason
      ? `Bản ghi chấm công ngày ${dateInfo} đã bị xóa. Lý do: ${reason}`
      : `Bản ghi chấm công ngày ${dateInfo} đã bị xóa.`;
    await createNotification(connection, {
      recipientId: rows[0].user_id,
      type: 'ATTENDANCE_DELETED',
      title: 'Bạn đã bị xóa chấm công',
      message,
      dateInfo,
      reason,
    });
    await connection.execute(
      'INSERT INTO attendance_deletion_logs (attendance_id, deleted_by, reason) VALUES (?, ?, ?)',
      [request.params.attendanceId, request.user.userId, reason || null],
    );
    await connection.execute('DELETE FROM attendance WHERE id = ?', [request.params.attendanceId]);
    await connection.commit();
    return response.json({ success: true, message: 'Đã xóa bản ghi chấm công.' });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.patch('/approvals/:eventId', async (request, response, next) => {
  const status = String(request.body.status || '').toUpperCase();
  const reason = typeof request.body.reason === 'string' ? request.body.reason.trim().slice(0, 500) : null;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return response.status(400).json({ success: false, message: 'Trạng thái duyệt không hợp lệ.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [events] = await connection.execute(
      `SELECT e.attendance_id, e.user_id, e.event_type, a.attendance_date, a.shift_name
       FROM attendance_events e JOIN attendance a ON a.id = e.attendance_id
       WHERE e.id = ? AND e.status = ? FOR UPDATE`,
      [request.params.eventId, 'PENDING'],
    );
    if (!events[0]) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Yêu cầu không còn chờ duyệt.' });
    }
    await connection.execute(
      'UPDATE attendance_events SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      [status, request.user.userId, request.params.eventId],
    );
    const dateInfo = `${events[0].shift_name || 'Ca làm việc'} - Ngày ${new Date(events[0].attendance_date).toLocaleDateString('vi-VN')}`;
    const eventLabel = events[0].event_type === 'CHECK_IN' ? 'check-in' : 'check-out';
    await createNotification(connection, {
      recipientId: events[0].user_id,
      type: status === 'APPROVED' ? 'ATTENDANCE_APPROVED' : 'ATTENDANCE_REJECTED',
      title: status === 'APPROVED' ? 'Chấm công đã được phê duyệt' : 'Yêu cầu chấm công bị từ chối',
      message: status === 'APPROVED'
        ? `Yêu cầu ${eventLabel} ${dateInfo} của bạn đã được phê duyệt.`
        : `Yêu cầu ${eventLabel} ${dateInfo} của bạn bị từ chối.${reason ? ` Lý do: ${reason}` : ''}`,
      dateInfo,
      reason: status === 'REJECTED' ? reason : null,
    });
    const attendanceId = events[0].attendance_id;
    const [pending] = await connection.execute(
      "SELECT COUNT(*) AS count FROM attendance_events WHERE attendance_id = ? AND status = 'PENDING'",
      [attendanceId],
    );
    const nextAttendanceStatus = status === 'REJECTED' ? 'REJECTED' : Number(pending[0].count) === 0 ? 'APPROVED' : 'PENDING';
    await connection.execute('UPDATE attendance SET status = ? WHERE id = ?', [nextAttendanceStatus, attendanceId]);
    await connection.commit();
    return response.json({ success: true, status });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

export default router;
