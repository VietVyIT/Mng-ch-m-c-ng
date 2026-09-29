import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../config/database.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { DEFAULT_SHIFTS } from '../config/shifts.js';
import { createNotification } from '../utils/notifications.js';
import { parseFaceEmbedding } from '../utils/face.js';

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
  const [hoursColumns] = await connection.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'total_work_hours' LIMIT 1`,
  );
  if (!hoursColumns.length) {
    await connection.execute('ALTER TABLE users ADD COLUMN total_work_hours DECIMAL(8,2) NOT NULL DEFAULT 0');
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

async function deleteLegacyAttendanceForUsers(connection, userIds) {
  if (!userIds.length) return;
  const placeholders = userIds.map(() => '?').join(',');
  await connection.execute(
    `DELETE logs FROM attendance_logs logs
     JOIN users u
       ON logs.mssv COLLATE utf8mb4_unicode_ci = u.username COLLATE utf8mb4_unicode_ci
       OR (u.student_code IS NOT NULL
           AND logs.mssv COLLATE utf8mb4_unicode_ci = u.student_code COLLATE utf8mb4_unicode_ci)
     WHERE u.id IN (${placeholders})`,
    userIds,
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
    let noStudentCodeUsers = 0;
    const defaultPasswordHash = await bcrypt.hash('user123@', 12);
    const noStudentCodePasswordHash = await bcrypt.hash('user123', 12);
    for (const member of members) {
      const name = typeof member.userName === 'string' ? member.userName.trim().replace(/\s+/g, ' ') : '';
      const mssv = typeof member.userMSSV === 'string' ? member.userMSSV.trim() : '';
      const phone = typeof member.phone === 'string' ? member.phone.trim().slice(0, 30) : '';
      const totalWorkDays = Number(member.totalWorkDays) || 0;
      const totalWorkHours = Number(member.totalHours) || 0;
      if (!name) continue;
      if (!mssv) noStudentCodeUsers += 1;
      const [existing] = await connection.execute(
        `SELECT id FROM users
         WHERE role = 'USER'
           AND ((? <> '' AND student_code = ?)
             OR (LOWER(TRIM(full_name)) = LOWER(?)
               AND (student_code IS NULL OR student_code = ?)))
         LIMIT 1`,
        [mssv, mssv, name, mssv],
      );
      let userId = existing[0]?.id;
      if (userId) {
        if (mssv) {
          await connection.execute(
            `UPDATE users SET full_name = ?, student_code = ?, phone = NULLIF(?, ''),
             total_work_days = ?, total_work_hours = ? WHERE id = ?`,
            [name, mssv, phone, totalWorkDays, totalWorkHours, userId],
          );
        } else {
          await connection.execute(
            `UPDATE users SET full_name = ?, student_code = NULL, phone = NULLIF(?, ''),
             password_hash = ?, must_change_password = TRUE,
             total_work_days = ?, total_work_hours = ? WHERE id = ?`,
            [name, phone, noStudentCodePasswordHash, totalWorkDays, totalWorkHours, userId],
          );
        }
      } else {
        const [created] = await connection.execute(
          `INSERT INTO users
           (full_name, student_code, phone, username, password_hash, role, must_change_password, total_work_days, total_work_hours)
           VALUES (?, NULLIF(?, ''), NULLIF(?, ''), ?, ?, 'USER', TRUE, ?, ?)`,
          [name, mssv, phone, name, mssv ? defaultPasswordHash : noStudentCodePasswordHash, totalWorkDays, totalWorkHours],
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
      const allowedShifts = { MORNING: ['Ca Sáng', '07:30:00', '12:00:00'], AFTERNOON: ['Ca Chiều', '13:30:00', '17:30:00'], EVENING: ['Ca Tối', '17:30:00', '20:00:00'] };
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
    return response.status(201).json({ success: true, imported, unmatched, noStudentCodeUsers });
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
              hometown_province_code, hometown_province_name, total_work_days, total_work_hours,
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
              hometown_province_code, hometown_province_name, total_work_days, total_work_hours,
              face_registered, face_embedding, must_change_password, created_at, updated_at
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
              a.total_hours, a.status,
              ci.captured_at AS check_in_captured_at,
              ci.photo_expired AS check_in_photo_expired,
              (ci.image IS NOT NULL) AS check_in_photo_available,
              co.captured_at AS check_out_captured_at,
              co.photo_expired AS check_out_photo_expired,
              (co.image IS NOT NULL) AS check_out_photo_available
       FROM attendance a
       LEFT JOIN attendance_events ci ON ci.attendance_id = a.id AND ci.event_type = 'CHECK_IN'
       LEFT JOIN attendance_events co ON co.attendance_id = a.id AND co.event_type = 'CHECK_OUT'
       WHERE a.user_id = ? AND a.status = 'APPROVED'
       ORDER BY a.attendance_date DESC, a.shift_start`,
      [request.params.userId],
    );
    const { face_embedding: faceEmbedding, ...user } = users[0];
    return response.json({
      success: true,
      data: {
        user: {
          ...user,
          face_registered: Boolean(parseFaceEmbedding(faceEmbedding)),
        },
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
    await deleteLegacyAttendanceForUsers(connection, [request.params.userId]);
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
    await deleteLegacyAttendanceForUsers(connection, users.map((user) => user.id));
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

router.post('/users/:userId/face/reset', async (request, response, next) => {
  const targetId = Number(request.params.userId);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return response.status(400).json({ success: false, message: 'ID người dùng không hợp lệ.' });
  }
  try {
    const [result] = await pool.execute(
      `UPDATE users SET face_embedding = NULL, face_registered = FALSE
       WHERE id = ? AND role = 'USER'`,
      [targetId],
    );
    if (!result.affectedRows) {
      const [users] = await pool.execute(
        "SELECT id FROM users WHERE id = ? AND role = 'USER' LIMIT 1",
        [targetId],
      );
      if (users.length) {
        return response.json({
          success: true,
          message: 'Tài khoản chưa có dữ liệu khuôn mặt. Thành viên có thể đăng ký khi check-in lần tiếp theo.',
        });
      }
      return response.status(404).json({ success: false, message: 'Không tìm thấy tài khoản người dùng.' });
    }
    return response.json({
      success: true,
      message: 'Đã xóa dữ liệu khuôn mặt cũ. Thành viên có thể đăng ký lại khi check-in lần tiếp theo.',
    });
  } catch (error) {
    return next(error);
  }
});

// DELETE USER COMPLETELY FROM SYSTEM
router.delete('/users/:userId', async (request, response, next) => {
  const targetId = Number(request.params.userId);
  if (!targetId || targetId <= 0) {
    return response.status(400).json({ success: false, message: 'ID người dùng không hợp lệ.' });
  }

  if (targetId === request.user.userId) {
    return response.status(400).json({ success: false, message: 'Không thể tự xóa tài khoản Quản trị viên của bạn.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [users] = await connection.execute('SELECT id, full_name, username, role FROM users WHERE id = ? FOR UPDATE', [targetId]);
    const user = users[0];
    if (!user) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy người dùng cần xóa.' });
    }

    if (user.role === 'ADMIN') {
      const [adminCount] = await connection.execute('SELECT COUNT(*) AS count FROM users WHERE role = \'ADMIN\'');
      if (adminCount[0]?.count <= 1) {
        await connection.rollback();
        return response.status(400).json({ success: false, message: 'Không thể xóa Quản trị viên duy nhất của hệ thống.' });
      }
    }

    // Clean up related records in all tables (except users)
    await connection.execute('DELETE FROM notifications WHERE recipient_id = ? AND type LIKE "%ATTENDANCE%"', [targetId]);
    await deleteLegacyAttendanceForUsers(connection, [targetId]);
    await connection.execute('DELETE FROM attendance_events WHERE user_id = ?', [targetId]);
    await connection.execute('DELETE FROM imported_attendance_records WHERE user_id = ?', [targetId]);
    await connection.execute('DELETE FROM attendance WHERE user_id = ?', [targetId]);
    await connection.execute('UPDATE users SET total_work_days = 0 WHERE id = ?', [targetId]);

    await connection.commit();
    return response.json({
      success: true,
      message: `Đã xóa dữ liệu điểm danh của thành viên "${user.full_name}" (${user.username}). Tài khoản vẫn được giữ nguyên.`,
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

// BULK DELETE USERS COMPLETELY FROM SYSTEM
router.delete('/bulk-delete-users', async (request, response, next) => {
  const userIds = Array.isArray(request.body?.userIds)
    ? [...new Set(request.body.userIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];

  if (!userIds.length || userIds.length > 500) {
    return response.status(400).json({ success: false, message: 'Vui lòng chọn từ 1 đến 500 người dùng để xóa.' });
  }

  const safeUserIds = userIds.filter((id) => id !== request.user.userId);
  if (!safeUserIds.length) {
    return response.status(400).json({ success: false, message: 'Không thể tự xóa tài khoản Quản trị viên.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const placeholders = safeUserIds.map(() => '?').join(',');
    const [users] = await connection.execute(
      `SELECT id, full_name, username, role FROM users WHERE id IN (${placeholders}) FOR UPDATE`,
      safeUserIds,
    );

    if (!users.length) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy người dùng hợp lệ để xóa.' });
    }

    await connection.execute(`DELETE FROM notifications WHERE recipient_id IN (${placeholders}) AND type LIKE "%ATTENDANCE%"`, safeUserIds);
    await deleteLegacyAttendanceForUsers(connection, safeUserIds);
    await connection.execute(`DELETE FROM attendance_events WHERE user_id IN (${placeholders})`, safeUserIds);
    await connection.execute(`DELETE FROM imported_attendance_records WHERE user_id IN (${placeholders})`, safeUserIds);
    await connection.execute(`DELETE FROM attendance WHERE user_id IN (${placeholders})`, safeUserIds);
    await connection.execute(`UPDATE users SET total_work_days = 0 WHERE id IN (${placeholders})`, safeUserIds);

    await connection.commit();
    return response.json({
      success: true,
      deletedCount: users.length,
      message: `Đã xóa dữ liệu điểm danh của ${users.length} thành viên. Tài khoản vẫn được giữ nguyên.`,
    });
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

router.get('/dashboard-stats', async (request, response, next) => {
  try {
    await ensureImportedAttendanceTable(pool);
    const range = String(request.query.range || '7days').toLowerCase();
    const selectedDate = typeof request.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(request.query.date)
      ? request.query.date
      : new Date().toISOString().slice(0, 10);

    // 1. Total work days: sum of users.total_work_days
    const [totalWorkDaysRow] = await pool.execute(
      "SELECT COALESCE(SUM(total_work_days), 0) AS total FROM users WHERE role = 'USER'",
    );
    const totalWorkDays = Number(totalWorkDaysRow[0].total) || 0;
    const totalHours = totalWorkDays * 8;

    // 2. Total students
    const [totalStudentsRow] = await pool.execute(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'USER'",
    );
    const totalStudents = Number(totalStudentsRow[0].total) || 0;

    // 3. Check-in count for selectedDate (unique users)
    const [dateCheckinRow] = await pool.execute(
      `SELECT COUNT(DISTINCT user_id) AS count FROM (
         SELECT user_id FROM attendance WHERE attendance_date = ?
         UNION
         SELECT user_id FROM imported_attendance_records WHERE attendance_date = ?
       ) combined`,
      [selectedDate, selectedDate],
    );
    const todayCheckins = Number(dateCheckinRow[0].count) || 0;

    // 4. Pending approval count
    const [pendingRow] = await pool.execute(
      "SELECT COUNT(*) AS count FROM attendance_events WHERE status = 'PENDING'",
    );
    const pendingCount = Number(pendingRow[0].count) || 0;

    // 5. Determine date range for trend chart
    let startDate, endDate;
    if (range === 'all') {
      const [rangeRow] = await pool.execute(
        `SELECT MIN(min_date) AS start_date, MAX(max_date) AS end_date FROM (
           SELECT MIN(attendance_date) AS min_date, MAX(attendance_date) AS max_date FROM attendance
           UNION ALL
           SELECT MIN(attendance_date) AS min_date, MAX(attendance_date) AS max_date FROM imported_attendance_records
         ) ranges`,
      );
      startDate = rangeRow[0].start_date;
      endDate = rangeRow[0].end_date;
      if (!startDate || !endDate) {
        startDate = selectedDate;
        endDate = selectedDate;
      }
    } else {
      endDate = selectedDate;
      // Go 6 days back so we have 7 days total
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 6);
      startDate = d.toISOString().slice(0, 10);
    }

    // 6. Build trend: imported_attendance_records count as onTime, camera records split by punctuality
    const [trendRows] = await pool.execute(
      `SELECT
         all_dates.dt AS date,
         COALESCE(cam_ontime.count, 0) AS cam_ontime,
         COALESCE(cam_late.count, 0) AS cam_late,
         COALESCE(imp.count, 0) AS imported
       FROM (
         SELECT DISTINCT attendance_date AS dt FROM attendance
           WHERE attendance_date >= ? AND attendance_date <= ?
         UNION
         SELECT DISTINCT attendance_date AS dt FROM imported_attendance_records
           WHERE attendance_date >= ? AND attendance_date <= ?
       ) all_dates
       LEFT JOIN (
         SELECT attendance_date, COUNT(*) AS count
         FROM attendance
         WHERE attendance_date >= ? AND attendance_date <= ?
           AND (punctuality_status = 'ON_TIME' OR (punctuality_status IS NULL AND (is_late = FALSE OR is_late IS NULL)))
         GROUP BY attendance_date
       ) cam_ontime ON cam_ontime.attendance_date = all_dates.dt
       LEFT JOIN (
         SELECT attendance_date, COUNT(*) AS count
         FROM attendance
         WHERE attendance_date >= ? AND attendance_date <= ?
           AND (punctuality_status = 'LATE' OR is_late = TRUE)
         GROUP BY attendance_date
       ) cam_late ON cam_late.attendance_date = all_dates.dt
       LEFT JOIN (
         SELECT attendance_date, COUNT(*) AS count
         FROM imported_attendance_records
         WHERE attendance_date >= ? AND attendance_date <= ?
         GROUP BY attendance_date
       ) imp ON imp.attendance_date = all_dates.dt
       ORDER BY all_dates.dt ASC`,
      [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate],
    );

    const trend = trendRows.map((row) => {
      const d = new Date(row.date);
      return {
        date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
        label: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
        fullLabel: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        onTime: Number(row.imported) + Number(row.cam_ontime),
        late: Number(row.cam_late),
      };
    });

    // 7. Shift distribution for the selectedDate
    const [shiftDistRows] = await pool.execute(
      `SELECT shift_code, shift_name, COUNT(*) AS count
       FROM (
         SELECT shift_code, shift_name FROM attendance WHERE attendance_date = ?
         UNION ALL
         SELECT shift_code, shift_name FROM imported_attendance_records WHERE attendance_date = ?
       ) combined
       GROUP BY shift_code, shift_name
       ORDER BY FIELD(shift_code, 'MORNING', 'AFTERNOON', 'EVENING')`,
      [selectedDate, selectedDate],
    );

    const shiftDistribution = shiftDistRows.map((row) => ({
      code: row.shift_code,
      name: row.shift_name,
      count: Number(row.count),
    }));

    // 8. Date range metadata
    const [allDateRange] = await pool.execute(
      `SELECT MIN(min_date) AS start_date, MAX(max_date) AS end_date FROM (
         SELECT MIN(attendance_date) AS min_date, MAX(attendance_date) AS max_date FROM attendance
         UNION ALL
         SELECT MIN(attendance_date) AS min_date, MAX(attendance_date) AS max_date FROM imported_attendance_records
       ) ranges`,
    );
    const periodStart = allDateRange[0].start_date
      ? (allDateRange[0].start_date instanceof Date ? allDateRange[0].start_date.toISOString().slice(0, 10) : String(allDateRange[0].start_date).slice(0, 10))
      : null;
    const periodEnd = allDateRange[0].end_date
      ? (allDateRange[0].end_date instanceof Date ? allDateRange[0].end_date.toISOString().slice(0, 10) : String(allDateRange[0].end_date).slice(0, 10))
      : null;

    return response.json({
      success: true,
      data: {
        selectedDate,
        range,
        totalWorkDays,
        totalHours,
        totalStudents,
        todayCheckins,
        pendingCount,
        trend,
        shiftDistribution,
        period: { start: periodStart, end: periodEnd },
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/shifts/:date', async (request, response, next) => {
  try {
    const [settings] = await pool.execute(
      `SELECT morning_enabled, afternoon_enabled, evening_enabled
       FROM shift_day_settings WHERE setting_date = ? LIMIT 1`,
      [request.params.date],
    );
    const [shiftRows] = await pool.execute(
      'SELECT id, name, start_time, end_time, is_active FROM shifts ORDER BY FIELD(id, "MORNING", "AFTERNOON", "EVENING")',
    );
    const daySettings = settings[0] || {
      morning_enabled: true,
      afternoon_enabled: true,
      evening_enabled: true,
    };
    return response.json({
      success: true,
      data: {
        date: request.params.date,
        morningEnabled: Boolean(daySettings.morning_enabled),
        afternoonEnabled: Boolean(daySettings.afternoon_enabled),
        eveningEnabled: Boolean(daySettings.evening_enabled),
        shifts: shiftRows.length ? shiftRows : DEFAULT_SHIFTS,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/shifts/:date', async (request, response, next) => {
  try {
    const morningEnabled = request.body.morningEnabled !== undefined ? Boolean(request.body.morningEnabled) : true;
    const afternoonEnabled = request.body.afternoonEnabled !== undefined ? Boolean(request.body.afternoonEnabled) : true;
    const eveningEnabled = request.body.eveningEnabled !== undefined ? Boolean(request.body.eveningEnabled) : true;
    await pool.execute(
      `INSERT INTO shift_day_settings (setting_date, morning_enabled, afternoon_enabled, evening_enabled, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE morning_enabled = VALUES(morning_enabled), afternoon_enabled = VALUES(afternoon_enabled), evening_enabled = VALUES(evening_enabled), updated_by = VALUES(updated_by)`,
      [request.params.date, morningEnabled, afternoonEnabled, eveningEnabled, request.user.userId],
    );
    return response.json({ success: true, data: { date: request.params.date, morningEnabled, afternoonEnabled, eveningEnabled } });
  } catch (error) {
    return next(error);
  }
});

async function ensureAttendanceLogReviewColumns(connection = pool) {
  const [columns] = await connection.execute(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_logs'
       AND COLUMN_NAME IN ('check_in_status', 'check_out_status')`,
  );
  const existing = new Set(columns.map((column) => column.COLUMN_NAME));
  if (!existing.has('check_in_status')) {
    await connection.execute(
      "ALTER TABLE attendance_logs ADD COLUMN check_in_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'",
    );
    await connection.execute(
      "UPDATE attendance_logs SET check_in_status = status WHERE check_in_time IS NOT NULL AND status IN ('APPROVED', 'REJECTED')",
    );
  }
  if (!existing.has('check_out_status')) {
    await connection.execute(
      "ALTER TABLE attendance_logs ADD COLUMN check_out_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'",
    );
    await connection.execute(
      "UPDATE attendance_logs SET check_out_status = status WHERE check_out_time IS NOT NULL AND status IN ('APPROVED', 'REJECTED')",
    );
  }
}

async function fetchAttendanceRequests(filter = 'all') {
  await ensureAttendanceLogReviewColumns();
  const legacyLateFilter = filter === 'late' ? ' AND a.is_late = 1' : filter === 'ontime' ? ' AND a.is_late = 0' : '';
  const eventLateFilter = filter === 'late' ? ' AND e.is_late = 1' : filter === 'ontime' ? ' AND e.is_late = 0' : '';
  const [checkIns, checkOuts, events] = await Promise.all([
    pool.execute(
      `SELECT CONCAT('legacy:CHECK_IN:', a.id) AS request_key,
              a.id AS event_id, a.id AS attendance_id, 'CHECK_IN' AS event_type,
              COALESCE(a.mssv, 'N/A') AS mssv,
              COALESCE(a.mssv, 'N/A') AS student_code,
              COALESCE(a.mssv, 'N/A') AS username,
              COALESCE(a.full_name, 'Sinh viên') AS full_name,
              COALESCE(a.shift, 'MORNING') AS shift,
              COALESCE(a.shift, 'MORNING') AS shift_name,
              a.work_date, a.work_date AS attendance_date,
              a.check_in_time AS captured_at, a.check_in_time, a.check_out_time,
              a.check_in_image, NULL AS check_out_image,
              a.check_in_status AS status, a.is_late,
              IF(a.is_late, 'LATE', 'ON_TIME') AS punctuality_status,
              a.late_minutes, 'LEGACY' AS source
       FROM attendance_logs a
       WHERE a.check_in_time IS NOT NULL AND a.check_in_status = 'PENDING'${legacyLateFilter}`,
    ),
    pool.execute(
      `SELECT CONCAT('legacy:CHECK_OUT:', a.id) AS request_key,
              a.id AS event_id, a.id AS attendance_id, 'CHECK_OUT' AS event_type,
              COALESCE(a.mssv, 'N/A') AS mssv,
              COALESCE(a.mssv, 'N/A') AS student_code,
              COALESCE(a.mssv, 'N/A') AS username,
              COALESCE(a.full_name, 'Sinh viên') AS full_name,
              COALESCE(a.shift, 'MORNING') AS shift,
              COALESCE(a.shift, 'MORNING') AS shift_name,
              a.work_date, a.work_date AS attendance_date,
              a.check_out_time AS captured_at, a.check_in_time, a.check_out_time,
              NULL AS check_in_image, a.check_out_image,
              a.check_out_status AS status, a.is_late,
              IF(a.is_late, 'LATE', 'ON_TIME') AS punctuality_status,
              a.late_minutes, 'LEGACY' AS source
       FROM attendance_logs a
       WHERE a.check_out_time IS NOT NULL AND a.check_out_status = 'PENDING'${legacyLateFilter}`,
    ),
    pool.execute(
      `SELECT CONCAT('event:', e.id) AS request_key,
              e.id AS event_id, e.attendance_id, e.event_type,
              COALESCE(u.student_code, u.username, 'N/A') AS mssv,
              COALESCE(u.student_code, u.username, 'N/A') AS student_code,
              u.username, u.full_name, a.shift_code AS shift,
              a.shift_name, a.attendance_date AS work_date,
              a.attendance_date, e.captured_at, a.check_in, a.check_out,
              IF(e.event_type = 'CHECK_IN' AND e.image IS NOT NULL,
                 CONCAT('data:', COALESCE(e.image_mime, 'image/jpeg'), ';base64,', TO_BASE64(e.image)), NULL) AS check_in_image,
              IF(e.event_type = 'CHECK_OUT' AND e.image IS NOT NULL,
                 CONCAT('data:', COALESCE(e.image_mime, 'image/jpeg'), ';base64,', TO_BASE64(e.image)), NULL) AS check_out_image,
              e.status, e.is_late, e.punctuality_status, 0 AS late_minutes, 'EVENT' AS source
       FROM attendance_events e
       JOIN attendance a ON a.id = e.attendance_id
       JOIN users u ON u.id = e.user_id
       WHERE e.status = 'PENDING'${eventLateFilter}`,
    ),
  ]);
  return [...checkIns[0], ...checkOuts[0], ...events[0]]
    .sort((left, right) => new Date(right.captured_at) - new Date(left.captured_at));
}

router.get('/attendance-requests', async (request, response, next) => {
  try {
    const filter = String(request.query.filter || 'all').toLowerCase();
    const data = await fetchAttendanceRequests(filter);
    return response.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
});

router.get('/approvals', async (request, response, next) => {
  try {
    const filter = String(request.query.filter || 'all').toLowerCase();
    const data = await fetchAttendanceRequests(filter);
    return response.json({ success: true, count: data.length, data });
  } catch (error) {
    return next(error);
  }
});

async function serveApprovalImage(request, response, next) {
  try {
    const requestKey = request.params.id || request.params.eventId;
    if (requestKey.startsWith('event:')) {
      const [events] = await pool.execute(
        `SELECT e.image, e.image_mime FROM attendance_events e
         WHERE e.id = ? LIMIT 1`,
        [requestKey.slice('event:'.length)],
      );
      if (!events[0]?.image) return response.status(404).json({ success: false, message: 'Ảnh không tồn tại.' });
      return response.json({
        success: true,
        data: `data:${events[0].image_mime || 'image/jpeg'};base64,${events[0].image.toString('base64')}`,
      });
    }
    const eventId = requestKey.startsWith('legacy:')
      ? requestKey.slice(requestKey.lastIndexOf(':') + 1)
      : requestKey;
    const eventType = requestKey.includes('CHECK_OUT') ? 'check_out_image' : 'check_in_image';
    const [rows] = await pool.execute(
      `SELECT ${eventType} AS image FROM attendance_logs WHERE id = ? LIMIT 1`,
      [eventId],
    );
    const image = rows[0]?.image;
    if (!image) return response.status(404).json({ success: false, message: 'Ảnh đã hết hạn hoặc không tồn tại.' });
    return response.json({ success: true, data: image });
  } catch (error) {
    return next(error);
  }
}

router.get('/approvals/:eventId/image', serveApprovalImage);
router.get('/attendance-requests/:id/image', serveApprovalImage);


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
    const [legacyRows] = await pool.execute(
      `SELECT a.id, u.id AS user_id, a.work_date AS attendance_date,
              a.shift AS shift_name, NULL AS shift_start, NULL AS shift_end,
              a.check_in_time AS check_in, a.check_out_time AS check_out,
              NULL AS total_hours, a.status, NULL AS punctuality_status,
              u.full_name, u.username,
              NULL AS check_in_event_id, NULL AS check_in_captured_at,
              NULL AS check_in_event_status, NULL AS check_in_photo_expired,
              (a.check_in_image IS NOT NULL) AS check_in_photo_available,
              NULL AS check_out_event_id, NULL AS check_out_captured_at,
              NULL AS check_out_event_status, NULL AS check_out_photo_expired,
              (a.check_out_image IS NOT NULL) AS check_out_photo_available,
              'Camera Request' AS source
       FROM attendance_logs a
       JOIN users u
         ON a.mssv COLLATE utf8mb4_unicode_ci = u.username COLLATE utf8mb4_unicode_ci
         OR (u.student_code IS NOT NULL
             AND a.mssv COLLATE utf8mb4_unicode_ci = u.student_code COLLATE utf8mb4_unicode_ci)
       ORDER BY a.work_date DESC, a.check_in_time DESC
       LIMIT 1000`,
    );
    return response.json({
      success: true,
      data: [...rows.map((row) => ({ ...row, source: 'Camera' })), ...importedRows, ...legacyRows]
        .sort((a, b) => new Date(b.attendance_date) - new Date(a.attendance_date)),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/attendance-logs/:attendanceId', async (request, response, next) => {
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim().slice(0, 500) : '';
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT a.*, u.id AS user_id
       FROM attendance_logs a
       JOIN users u
         ON a.mssv COLLATE utf8mb4_unicode_ci = u.username COLLATE utf8mb4_unicode_ci
         OR (u.student_code IS NOT NULL
             AND a.mssv COLLATE utf8mb4_unicode_ci = u.student_code COLLATE utf8mb4_unicode_ci)
       WHERE a.id = ? LIMIT 1 FOR UPDATE`,
      [request.params.attendanceId],
    );
    const record = rows[0];
    if (!record) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy bản ghi chấm công.' });
    }
    if (record.status === 'APPROVED') {
      await connection.execute(
        'UPDATE users SET total_work_days = GREATEST(total_work_days - 1, 0) WHERE id = ?',
        [record.user_id],
      );
    }
    await createNotification(connection, {
      recipientId: record.user_id,
      type: 'ATTENDANCE_DELETED',
      title: 'Bạn đã bị xóa chấm công',
      message: `Bản ghi chấm công ngày ${record.shift || 'Ca làm việc'} - ${new Date(record.work_date).toLocaleDateString('vi-VN')} đã bị xóa.${reason ? ` Lý do: ${reason}` : ''}`,
      dateInfo: `${record.shift || 'Ca làm việc'} - ${new Date(record.work_date).toLocaleDateString('vi-VN')}`,
      reason: reason || null,
    });
    await connection.execute('DELETE FROM attendance_logs WHERE id = ?', [request.params.attendanceId]);
    await connection.commit();
    return response.json({ success: true, message: 'Đã xóa bản ghi chấm công.' });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

router.get('/attendance/:attendanceId/image/:type', async (request, response, next) => {
  try {
    await pool.execute(
      `UPDATE attendance_events SET image = NULL, photo_expired = TRUE
       WHERE image IS NOT NULL AND captured_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    );
    const eventType = request.params.type === 'check-in' ? 'CHECK_IN' : request.params.type === 'check-out' ? 'CHECK_OUT' : null;
    if (!eventType) return response.status(400).json({ success: false, message: 'Loại ảnh không hợp lệ.' });
    const [rows] = await pool.execute(
      `SELECT image, image_mime FROM attendance_events
       WHERE attendance_id = ? AND event_type = ? ORDER BY captured_at DESC LIMIT 1`,
      [request.params.attendanceId, eventType],
    );
    if (!rows[0]?.image) return response.status(404).json({ success: false, message: 'Ảnh đã hết hạn hoặc không tồn tại.' });
    const base64Data = rows[0].image.toString('base64');
    const mime = rows[0].image_mime || 'image/jpeg';
    return response.json({ success: true, data: `data:${mime};base64,${base64Data}` });
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
      `SELECT a.*, u.id AS user_id
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       WHERE a.id = ? LIMIT 1 FOR UPDATE`,
      [request.params.attendanceId],
    );
    if (!rows[0]) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy bản ghi chấm công.' });
    }
    const evt = rows[0];
    const dateInfo = `${evt.shift_name || evt.shift_code || 'Ca làm việc'} - Ngày ${new Date(evt.attendance_date).toLocaleDateString('vi-VN')}`;
    const message = reason
      ? `Bản ghi chấm công ngày ${dateInfo} đã bị xóa. Lý do: ${reason}`
      : `Bản ghi chấm công ngày ${dateInfo} đã bị xóa.`;

    await createNotification(connection, {
      recipientId: evt.user_id,
      type: 'ATTENDANCE_DELETED',
      title: 'Bạn đã bị xóa chấm công',
      message,
      dateInfo,
      reason,
    });
    if (evt.status === 'APPROVED') {
      await connection.execute(
        `UPDATE users SET total_work_days = GREATEST(total_work_days - 1, 0)
         WHERE id = ?`,
        [evt.user_id],
      );
    }
    await connection.execute('DELETE FROM attendance_events WHERE attendance_id = ?', [request.params.attendanceId]);
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

async function applyApproval(connection, requestKey, status, reason = null, adminUserId) {
  if (requestKey.startsWith('legacy:')) {
    await ensureAttendanceLogReviewColumns(connection);
    const [, eventType, id] = requestKey.split(':');
    if (!['CHECK_IN', 'CHECK_OUT'].includes(eventType) || !id) {
      throw new Error('Yêu cầu duyệt không hợp lệ.');
    }
    const statusColumn = eventType === 'CHECK_IN' ? 'check_in_status' : 'check_out_status';
    const timeColumn = eventType === 'CHECK_IN' ? 'check_in_time' : 'check_out_time';
    const [rows] = await connection.execute(
      `SELECT a.*, u.id AS user_id
       FROM attendance_logs a
       LEFT JOIN users u
         ON u.student_code COLLATE utf8mb4_unicode_ci = a.mssv COLLATE utf8mb4_unicode_ci
         OR u.username COLLATE utf8mb4_unicode_ci = a.mssv COLLATE utf8mb4_unicode_ci
       WHERE a.id = ? AND a.${timeColumn} IS NOT NULL FOR UPDATE`,
      [id],
    );
    const evt = rows[0];
    if (!evt || evt[statusColumn] !== 'PENDING') return false;
    const wasCompleted = evt.check_in_status === 'APPROVED' && evt.check_out_status === 'APPROVED';
    await connection.execute(
      `UPDATE attendance_logs SET ${statusColumn} = ? WHERE id = ?`,
      [status, id],
    );
    const checkInStatus = eventType === 'CHECK_IN' ? status : evt.check_in_status;
    const checkOutStatus = eventType === 'CHECK_OUT' ? status : evt.check_out_status;
    const isCompleted = Boolean(evt.check_in_time && evt.check_out_time
      && checkInStatus === 'APPROVED' && checkOutStatus === 'APPROVED');
    const aggregateStatus = isCompleted ? 'APPROVED'
      : checkInStatus === 'REJECTED' || checkOutStatus === 'REJECTED' ? 'REJECTED'
        : 'PENDING';
    await connection.execute('UPDATE attendance_logs SET status = ? WHERE id = ?', [aggregateStatus, id]);
    if (evt.user_id && isCompleted && !wasCompleted) {
      await connection.execute('UPDATE users SET total_work_days = total_work_days + 1 WHERE id = ?', [evt.user_id]);
    }
    if (evt.user_id) {
      const dateInfo = `${evt.shift || 'Ca làm việc'} - Ngày ${new Date(evt.work_date).toLocaleDateString('vi-VN')}`;
      const eventName = eventType === 'CHECK_IN' ? 'Check-in' : 'Check-out';
      await createNotification(connection, {
        recipientId: evt.user_id,
        type: status === 'APPROVED' ? 'ATTENDANCE_APPROVED' : 'ATTENDANCE_REJECTED',
        title: status === 'APPROVED' ? `${eventName} đã được phê duyệt` : `${eventName} bị từ chối`,
        message: status === 'APPROVED'
          ? `${eventName} ${dateInfo} của bạn đã được phê duyệt.`
          : `${eventName} ${dateInfo} của bạn bị từ chối.${reason ? ` Lý do: ${reason}` : ''}`,
        dateInfo,
        reason: status === 'REJECTED' ? reason : null,
      });
    }
    return true;
  }

  if (requestKey.startsWith('event:')) {
    const id = requestKey.slice('event:'.length);
    const [rows] = await connection.execute(
      `SELECT e.*, a.status AS attendance_status, a.attendance_date, a.shift_name,
              u.id AS user_id, u.total_work_days
       FROM attendance_events e
       JOIN attendance a ON a.id = e.attendance_id
       JOIN users u ON u.id = e.user_id
       WHERE e.id = ? FOR UPDATE`,
      [id],
    );
    const evt = rows[0];
    if (!evt || evt.status !== 'PENDING') return false;
    await connection.execute(
      'UPDATE attendance_events SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      [status, adminUserId, id],
    );
    const [eventStatuses] = await connection.execute(
      `SELECT COUNT(*) AS total,
              SUM(status = 'APPROVED') AS approved,
              SUM(status = 'REJECTED') AS rejected
       FROM attendance_events WHERE attendance_id = ?`,
      [evt.attendance_id],
    );
    const fullyApproved = Number(eventStatuses[0].total) >= 2
      && Number(eventStatuses[0].approved) >= 2;
    const aggregateStatus = fullyApproved ? 'APPROVED'
      : Number(eventStatuses[0].rejected) > 0 ? 'REJECTED' : 'PENDING';
    await connection.execute('UPDATE attendance SET status = ? WHERE id = ?', [aggregateStatus, evt.attendance_id]);
    if (fullyApproved && evt.attendance_status !== 'APPROVED') {
      await connection.execute('UPDATE users SET total_work_days = total_work_days + 1 WHERE id = ?', [evt.user_id]);
    }
    const dateInfo = `${evt.shift_name || 'Ca làm việc'} - Ngày ${new Date(evt.attendance_date).toLocaleDateString('vi-VN')}`;
    const eventName = evt.event_type === 'CHECK_IN' ? 'Check-in' : 'Check-out';
    await createNotification(connection, {
      recipientId: evt.user_id,
      type: status === 'APPROVED' ? 'ATTENDANCE_APPROVED' : 'ATTENDANCE_REJECTED',
      title: status === 'APPROVED' ? `${eventName} đã được phê duyệt` : `${eventName} bị từ chối`,
      message: status === 'APPROVED'
        ? `${eventName} ${dateInfo} của bạn đã được phê duyệt.`
        : `${eventName} ${dateInfo} của bạn bị từ chối.${reason ? ` Lý do: ${reason}` : ''}`,
      dateInfo,
      reason: status === 'REJECTED' ? reason : null,
    });
    return true;
  }
  return false;
}

async function reviewApprovalHandler(request, response, next) {
  const requestKey = String(request.params.id || request.params.eventId || '');
  const status = String(request.body.status || '').toUpperCase();
  const reason = typeof request.body.reason === 'string' ? request.body.reason.trim().slice(0, 500) : null;
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return response.status(400).json({ success: false, message: 'Trạng thái duyệt không hợp lệ.' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const changed = await applyApproval(connection, requestKey, status, reason, request.user.userId);
    if (!changed) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Yêu cầu không còn chờ duyệt.' });
    }
    await connection.commit();
    return response.json({ success: true, status, message: status === 'APPROVED' ? 'Đã phê duyệt yêu cầu thành công.' : 'Đã từ chối yêu cầu.' });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
}

async function approveAllHandler(request, response, next) {
  const connection = await pool.getConnection();
  try {
    const filter = String(request.body?.filter || 'all');
    const requests = await fetchAttendanceRequests(filter);
    await connection.beginTransaction();
    let approvedCount = 0;
    for (const item of requests) {
      if (await applyApproval(connection, item.request_key, 'APPROVED', null, request.user.userId)) approvedCount += 1;
    }
    await connection.commit();
    return response.json({
      success: true,
      approvedCount,
      message: `Đã phê duyệt thành công ${approvedCount} yêu cầu chấm công.`,
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
}

router.patch('/approvals/:eventId', reviewApprovalHandler);
router.patch('/attendance-requests/:id', reviewApprovalHandler);

router.post('/approvals/approve-all', approveAllHandler);
router.patch('/approvals/approve-all', approveAllHandler);
router.post('/attendance-requests/approve-all', approveAllHandler);
router.patch('/attendance-requests/approve-all', approveAllHandler);

router.get('/shifts-config', async (request, response, next) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, start_time, end_time, is_active FROM shifts ORDER BY FIELD(id, "MORNING", "AFTERNOON", "EVENING")');
    if (!rows || rows.length === 0) {
      throw new Error('Empty shifts');
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

router.put('/shifts-config/:id', async (request, response, next) => {
  try {
    const { name, start_time, end_time, is_active } = request.body;
    await pool.execute(
      'UPDATE shifts SET name = ?, start_time = ?, end_time = ?, is_active = ? WHERE id = ?',
      [name, start_time, end_time, is_active ? 1 : 0, request.params.id]
    );
    return response.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) {
    return next(error);
  }
});
router.get('/face-requests', async (request, response, next) => {
  try {
    const status = request.query.status || 'PENDING';
    const [rows] = await pool.execute(
      `SELECT req.id, req.user_id, req.status, req.created_at, req.new_face_image, u.full_name, u.student_code
       FROM face_re_registration_requests req
       JOIN users u ON req.user_id = u.id
       WHERE req.status = ?
       ORDER BY req.created_at DESC`,
      [status]
    );
    return response.json({ success: true, data: rows });
  } catch (error) {
    return next(error);
  }
});

router.post('/face-requests/:id/approve', async (request, response, next) => {
  let connection;
  try {
    const requestId = request.params.id;
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [requests] = await connection.execute(
      'SELECT id, user_id, status, new_face_embedding FROM face_re_registration_requests WHERE id = ? FOR UPDATE',
      [requestId]
    );

    if (!requests.length) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu' });
    }

    const req = requests[0];
    if (req.status !== 'PENDING') {
      await connection.rollback();
      return response.status(400).json({ success: false, message: 'Yêu cầu này đã được xử lý' });
    }

    const replacementEmbedding = parseFaceEmbedding(req.new_face_embedding);
    if (!replacementEmbedding) {
      await connection.rollback();
      return response.status(400).json({ success: false, message: 'Dữ liệu khuôn mặt trong yêu cầu không hợp lệ.' });
    }

    await connection.execute(
      'UPDATE users SET face_embedding = ?, face_registered = TRUE WHERE id = ?',
      [JSON.stringify(replacementEmbedding), req.user_id]
    );

    await connection.execute(
      'UPDATE face_re_registration_requests SET status = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?',
      ['APPROVED', request.user.userId, requestId]
    );

    await connection.commit();
    return response.json({ success: true, message: 'Đã duyệt yêu cầu đăng ký lại khuôn mặt' });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    if (connection) connection.release();
  }
});

router.post('/face-requests/:id/reject', async (request, response, next) => {
  try {
    const requestId = request.params.id;
    const reason = typeof request.body.reason === 'string'
      ? request.body.reason.trim().slice(0, 500) || null
      : null;

    const [requests] = await pool.execute(
      'SELECT id, status FROM face_re_registration_requests WHERE id = ?',
      [requestId]
    );

    if (!requests.length) {
      return response.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu' });
    }

    if (requests[0].status !== 'PENDING') {
      return response.status(400).json({ success: false, message: 'Yêu cầu này đã được xử lý' });
    }

    await pool.execute(
      'UPDATE face_re_registration_requests SET status = ?, rejection_reason = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?',
      ['REJECTED', reason, request.user.userId, requestId]
    );

    return response.json({ success: true, message: 'Đã từ chối yêu cầu' });
  } catch (error) {
    return next(error);
  }
});

export default router;
