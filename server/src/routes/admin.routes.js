import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../config/database.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { DEFAULT_SHIFTS } from '../config/shifts.js';
import { createNotification } from '../utils/notifications.js';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

async function ensureImportedAttendanceTable(connection) {
  const [columns] = await connection.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'total_work_days' LIMIT 1`,
  );
  if (!columns.length) {
    await connection.execute('ALTER TABLE users ADD COLUMN total_work_days DECIMAL(8,2) NOT NULL DEFAULT 0');
  }
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS imported_attendance_records (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NOT NULL,
      attendance_date DATE NOT NULL,
      shift_code VARCHAR(20) NOT NULL,
      shift_name VARCHAR(80) NOT NULL,
      shift_start TIME NOT NULL,
      shift_end TIME NOT NULL,
      check_in DATETIME NULL,
      check_out DATETIME NULL,
      total_hours DECIMAL(6,2) NOT NULL,
      status ENUM('APPROVED') NOT NULL DEFAULT 'APPROVED',
      imported_from_excel BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_imported_attendance (user_id, attendance_date, shift_code),
      KEY idx_imported_user_date (user_id, attendance_date),
      CONSTRAINT fk_imported_attendance_user FOREIGN KEY (user_id) REFERENCES users (id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB`,
  );
}

router.post('/attendance/import-excel', async (request, response, next) => {
  const records = Array.isArray(request.body.records) ? request.body.records : [];
  const members = Array.isArray(request.body.members) ? request.body.members : [];
  if ((!records.length && !members.length) || records.length > 5000 || members.length > 1000) {
    return response.status(400).json({ success: false, message: 'Dữ liệu import phải có từ 1 đến 5.000 lượt chấm công.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureImportedAttendanceTable(connection);
    const unmatched = [];
    const userIds = new Map();
    const defaultPasswordHash = await bcrypt.hash('user123@', 12);
    for (const member of members) {
      const name = typeof member.userName === 'string' ? member.userName.trim().replace(/\s+/g, ' ') : '';
      const mssv = typeof member.userMSSV === 'string' ? member.userMSSV.trim() : '';
      const phone = typeof member.phone === 'string' ? member.phone.trim().slice(0, 30) : '';
      const totalWorkDays = Number(member.totalWorkDays) || 0;
      if (!name) continue;
      const [existing] = await connection.execute(
        `SELECT id FROM users
         WHERE (role = 'USER' AND ((? <> '' AND student_code = ?) OR LOWER(TRIM(full_name)) = LOWER(?)))
         LIMIT 1`,
        [mssv, mssv, name],
      );
      let userId = existing[0]?.id;
      if (userId) {
        await connection.execute(
          `UPDATE users SET full_name = ?, student_code = NULLIF(?, ''), phone = NULLIF(?, ''),
           total_work_days = ? WHERE id = ?`,
          [name, mssv, phone, totalWorkDays, userId],
        );
      } else {
        const [created] = await connection.execute(
          `INSERT INTO users
           (full_name, student_code, phone, username, password_hash, role, must_change_password, total_work_days)
           VALUES (?, NULLIF(?, ''), NULLIF(?, ''), ?, ?, 'USER', TRUE, ?)`,
          [name, mssv, phone, name, defaultPasswordHash, totalWorkDays],
        );
        userId = created.insertId;
      }
      userIds.set(`${mssv}|${name.toLowerCase()}`, userId);
    }
    let imported = 0;
    for (const record of records) {
      const name = typeof record.userName === 'string' ? record.userName.trim().replace(/\s+/g, ' ') : '';
      const mssv = typeof record.userMSSV === 'string' ? record.userMSSV.trim() : '';
      const userId = userIds.get(`${mssv}|${name.toLowerCase()}`);
      if (!userId) {
        unmatched.push({ userName: name, userMSSV: mssv });
        continue;
      }
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(record.date);
      const allowedShifts = { MORNING: ['Ca sáng', '07:30:00', '12:00:00'], AFTERNOON: ['Ca chiều', '13:30:00', '17:30:00'], EVENING: ['Ca tối', '17:30:00', '20:00:00'] };
      const shift = allowedShifts[record.shiftCode];
      if (!validDate || !shift) continue;
      await connection.execute(
        `INSERT INTO imported_attendance_records
          (user_id, attendance_date, shift_code, shift_name, shift_start, shift_end, check_in, check_out, total_hours)
         VALUES (?, ?, ?, ?, ?, ?, CONCAT(?, ' ', ?), CONCAT(?, ' ', ?), ?)
         ON DUPLICATE KEY UPDATE check_in = VALUES(check_in), check_out = VALUES(check_out), total_hours = VALUES(total_hours)`,
        [userId, record.date, record.shiftCode, shift[0], shift[1], shift[2], record.date, shift[1], record.date, shift[2], Number(record.totalHours) || 0],
      );
      imported += 1;
    }
    await connection.commit();
    return response.status(201).json({ success: true, imported, unmatched });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.get('/imported-attendance/users', async (request, response, next) => {
  const search = typeof request.query.search === 'string' ? request.query.search.trim().slice(0, 100) : '';
  try {
    await ensureImportedAttendanceTable(pool);
    const [rows] = await pool.execute(
      `SELECT id, full_name, username, student_code, phone, address,
              hometown_province_code, hometown_province_name, total_work_days,
              face_registered, must_change_password, created_at, updated_at
       FROM users WHERE role = 'USER' AND (? = '' OR LOWER(full_name) LIKE LOWER(?))
       ORDER BY full_name LIMIT 100`,
      [search, `%${search}%`],
    );
    return response.json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
});

router.get('/imported-attendance/users/:userId', async (request, response, next) => {
  try {
    await ensureImportedAttendanceTable(pool);
    const [users] = await pool.execute(
      `SELECT id, full_name, username, student_code, phone, address,
              hometown_province_code, hometown_province_name, total_work_days,
              face_registered, must_change_password, created_at, updated_at
       FROM users WHERE id = ? AND role = 'USER' LIMIT 1`,
      [request.params.userId],
    );
    if (!users[0]) return response.status(404).json({ success: false, message: 'Không tìm thấy thành viên.' });
    const [records] = await pool.execute(
      `SELECT id, attendance_date, shift_code, shift_name, check_in, check_out, total_hours
       FROM imported_attendance_records WHERE user_id = ?
       ORDER BY attendance_date DESC, shift_start`,
      [request.params.userId],
    );
    const [cameraRecords] = await pool.execute(
      `SELECT a.id, a.attendance_date, a.shift_code, a.shift_name, a.check_in, a.check_out,
              a.total_hours, a.status
       FROM attendance a WHERE a.user_id = ? AND a.status = 'APPROVED'
       ORDER BY a.attendance_date DESC, a.shift_start`,
      [request.params.userId],
    );
    return response.json({
      success: true,
      data: {
        user: users[0],
        records: [
          ...records.map((record) => ({ ...record, source: 'Excel Import' })),
          ...cameraRecords.map((record) => ({ ...record, source: 'Camera', imported_from_excel: false })),
        ].sort((a, b) => new Date(b.attendance_date) - new Date(a.attendance_date)),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/imported-attendance/records/:recordId', async (request, response, next) => {
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim().slice(0, 500) : '';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT r.id, r.user_id, r.attendance_date, r.shift_name, u.full_name
       FROM imported_attendance_records r JOIN users u ON u.id = r.user_id
       WHERE r.id = ? FOR UPDATE`,
      [request.params.recordId],
    );
    if (!rows[0]) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy ca chấm công.' });
    }
    const record = rows[0];
    await connection.execute('DELETE FROM imported_attendance_records WHERE id = ?', [record.id]);
    await connection.execute('UPDATE users SET total_work_days = GREATEST(total_work_days - 1, 0) WHERE id = ?', [record.user_id]);
    const dateInfo = `${record.shift_name} - Ngày ${new Date(record.attendance_date).toLocaleDateString('vi-VN')}`;
    await createNotification(connection, {
      recipientId: record.user_id,
      type: 'ATTENDANCE_DELETED',
      title: 'Bạn đã bị xóa chấm công',
      message: `Bản ghi chấm công ${dateInfo} đã bị xóa.${reason ? ` Lý do: ${reason}` : ''}`,
      dateInfo,
      reason: reason || null,
    });
    await connection.commit();
    return response.json({ success: true, message: `Đã xóa ca của ${record.full_name}.` });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.delete('/imported-attendance/users/:userId', async (request, response, next) => {
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim().slice(0, 500) : '';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.execute('SELECT id, full_name FROM users WHERE id = ? AND role = \'USER\' FOR UPDATE', [request.params.userId]);
    if (!users[0]) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy thành viên.' });
    }
    await connection.execute('DELETE FROM imported_attendance_records WHERE user_id = ?', [request.params.userId]);
    await connection.execute('DELETE FROM attendance WHERE user_id = ?', [request.params.userId]);
    await connection.execute('UPDATE users SET total_work_days = 0 WHERE id = ?', [request.params.userId]);
    await createNotification(connection, {
      recipientId: request.params.userId,
      type: 'ATTENDANCE_DELETED',
      title: 'Bạn đã bị xóa chấm công',
      message: `Toàn bộ lịch sử chấm công của bạn đã bị xóa.${reason ? ` Lý do: ${reason}` : ''}`,
      dateInfo: 'Toàn bộ lịch sử',
      reason: reason || null,
    });
    await connection.commit();
    return response.json({ success: true, message: `Đã xóa toàn bộ công của ${users[0].full_name}.` });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.delete('/imported-attendance/bulk-users', async (request, response, next) => {
  const userIds = Array.isArray(request.body?.userIds)
    ? [...new Set(request.body.userIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim().slice(0, 500) : '';
  if (!userIds.length || userIds.length > 500) {
    return response.status(400).json({ success: false, message: 'Vui lòng chọn từ 1 đến 500 sinh viên.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const placeholders = userIds.map(() => '?').join(',');
    const [users] = await connection.execute(
      `SELECT id, full_name FROM users WHERE role = 'USER' AND id IN (${placeholders}) FOR UPDATE`,
      userIds,
    );
    if (!users.length) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy sinh viên hợp lệ.' });
    }
    await connection.execute(`DELETE FROM imported_attendance_records WHERE user_id IN (${placeholders})`, userIds);
    await connection.execute(`DELETE FROM attendance WHERE user_id IN (${placeholders})`, userIds);
    await connection.execute(`UPDATE users SET total_work_days = 0 WHERE id IN (${placeholders})`, userIds);
    for (const user of users) {
      await createNotification(connection, {
        recipientId: user.id,
        type: 'ATTENDANCE_DELETED',
        title: 'Bạn đã bị xóa chấm công',
        message: `Toàn bộ lịch sử chấm công của bạn đã bị xóa.${reason ? ` Lý do: ${reason}` : ''}`,
        dateInfo: 'Toàn bộ lịch sử',
        reason: reason || null,
      });
    }
    await connection.commit();
    return response.json({ success: true, deletedCount: users.length, message: `Đã xóa toàn bộ công của ${users.length} sinh viên.` });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

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
    await ensureImportedAttendanceTable(pool);
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
    const [importedRows] = await pool.execute(
      `SELECT r.id, r.user_id, r.attendance_date, r.shift_name, r.shift_start, r.shift_end,
              r.check_in, r.check_out, r.total_hours, r.status, NULL AS punctuality_status,
              u.full_name, u.username, 'Excel Import' AS source
       FROM imported_attendance_records r JOIN users u ON u.id = r.user_id
       ORDER BY r.attendance_date DESC, r.check_in DESC LIMIT 1000`,
    );
    return response.json({ success: true, data: [...rows.map((row) => ({ ...row, source: 'Camera' })), ...importedRows].sort((a, b) => new Date(b.attendance_date) - new Date(a.attendance_date)) });
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
    await connection.execute(
      `UPDATE users SET total_work_days = GREATEST(total_work_days - 1, 0)
       WHERE id = ? AND EXISTS (
         SELECT 1 FROM attendance WHERE id = ? AND status = 'APPROVED'
       )`,
      [rows[0].user_id, request.params.attendanceId],
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
    if (status === 'APPROVED' && events[0].event_type === 'CHECK_IN') {
      await connection.execute('UPDATE users SET total_work_days = total_work_days + 1 WHERE id = ?', [events[0].user_id]);
    }
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
