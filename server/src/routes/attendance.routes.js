import express from 'express';
import db from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { canCheckOutAt, getShiftAttendanceState } from '../utils/attendance-window.js';
import { averageEmbeddings, faceDistance, parseFaceEmbedding, validateEmbedding } from '../utils/face.js';

const router = express.Router();

const toSeconds = (timeStr) => {
  if (!timeStr) return 0;
  const [hours = 0, minutes = 0, seconds = 0] = String(timeStr).split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

const getVietnamDateTime = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}:${part('second')}`,
  };
};

let reviewStatusColumnsPromise;

function ensureReviewStatusColumns() {
  if (!reviewStatusColumnsPromise) {
    reviewStatusColumnsPromise = (async () => {
      const [columns] = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_logs'
           AND COLUMN_NAME IN ('check_in_status', 'check_out_status')`,
      );
      const existing = new Set(columns.map((column) => column.COLUMN_NAME));
      if (!existing.has('check_in_status')) {
        await db.query("ALTER TABLE attendance_logs ADD COLUMN check_in_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'");
        await db.query("UPDATE attendance_logs SET check_in_status = status WHERE check_in_time IS NOT NULL AND status IN ('APPROVED', 'REJECTED')");
      }
      if (!existing.has('check_out_status')) {
        await db.query("ALTER TABLE attendance_logs ADD COLUMN check_out_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'");
        await db.query("UPDATE attendance_logs SET check_out_status = status WHERE check_out_time IS NOT NULL AND status IN ('APPROVED', 'REJECTED')");
      }
    })().catch((error) => {
      reviewStatusColumnsPromise = null;
      throw error;
    });
  }
  return reviewStatusColumnsPromise;
}

const shiftSettingColumns = {
  MORNING: 'morning_enabled',
  AFTERNOON: 'afternoon_enabled',
  EVENING: 'evening_enabled',
};

async function getShiftAvailability(shiftCode) {
  const { date, time } = getVietnamDateTime();
  if (shiftCode === 'FLEXIBLE') {
    return { id: 'FLEXIBLE', date, time };
  }
  const settingColumn = shiftSettingColumns[shiftCode];
  if (!settingColumn) return null;
  const [rows] = await db.query(
    `SELECT id, name, start_time, end_time, is_active
     FROM shifts ORDER BY FIELD(id, 'MORNING', 'AFTERNOON', 'EVENING')`,
  );
  const shift = rows.find((row) => row.id === shiftCode);
  if (!shift || Number(shift.is_active) !== 1) return null;
  const currentSeconds = toSeconds(time);
  const startSeconds = toSeconds(shift.start_time);
  const endSeconds = toSeconds(shift.end_time);
  const nextShift = rows
    .filter((row) => toSeconds(row.start_time) >= endSeconds)
    .sort((left, right) => toSeconds(left.start_time) - toSeconds(right.start_time))[0];
  const checkoutClosesAt = nextShift ? toSeconds(nextShift.start_time) : 24 * 60 * 60;
  if (!canCheckOutAt(currentSeconds, startSeconds, endSeconds, checkoutClosesAt)) return null;
  return { ...shift, date, time };
}

// 1. API CHECK-IN
router.post('/check-in', authenticate, async (req, res) => {
  let connection;
  try {
    await ensureReviewStatusColumns();
    const { image, imageData, embedding, embeddings } = req.body;
    const currentEmbedding = averageEmbeddings(embeddings) || (validateEmbedding(embedding) ? embedding : null);
    const finalImage = image || imageData || null;
    if (!currentEmbedding) {
      return res.status(400).json({ success: false, message: 'Không nhận diện được khuôn mặt. Hãy nhìn thẳng vào camera và thử lại.' });
    }
    const { date: checkDate, time: checkTime } = getVietnamDateTime();
    const effectiveShift = 'FLEXIBLE';

    connection = await db.getConnection();
    await connection.beginTransaction();
    const [users] = await connection.query(
      'SELECT id, username, student_code, full_name, face_embedding FROM users WHERE id = ? FOR UPDATE',
      [req.user.userId],
    );
    const user = users[0];
    if (!user) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'Không tìm thấy tài khoản đăng nhập.' });
    }
    const storedEmbedding = parseFaceEmbedding(user.face_embedding);
    if (!storedEmbedding) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Tài khoản chưa có dữ liệu khuôn mặt hợp lệ. Hãy đăng ký khuôn mặt rồi thử lại.',
        errorCode: 'FACE_NOT_REGISTERED',
      });
    }
    const matchDistance = faceDistance(currentEmbedding, storedEmbedding);
    if (matchDistance > env.faceMatchDistanceThreshold) {
      console.warn('Face mismatch during check-in.', {
        userId: user.id,
        distance: Number(matchDistance.toFixed(4)),
        threshold: env.faceMatchDistanceThreshold,
      });
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Khuôn mặt không khớp với tài khoản.', errorCode: 'FACE_MISMATCH' });
    }
    const userMssv = user.student_code || user.username;
    const identifiers = [...new Set([user.username, user.student_code].filter(Boolean))];
    const placeholders = identifiers.map(() => '?').join(', ');
    const [existing] = await connection.query(
      `SELECT id FROM attendance_logs
       WHERE mssv IN (${placeholders}) AND work_date = ? AND shift = ?
         AND check_in_time IS NOT NULL
       LIMIT 1 FOR UPDATE`,
      [...identifiers, checkDate, effectiveShift],
    );
    const [modernExisting] = await connection.query(
      `SELECT id FROM attendance
       WHERE user_id = ? AND attendance_date = ?
         AND shift_code = ? AND check_in IS NOT NULL
       LIMIT 1 FOR UPDATE`,
      [user.id, checkDate, effectiveShift],
    );
    const [importedExisting] = await connection.query(
      `SELECT id FROM imported_attendance_records
       WHERE user_id = ? AND attendance_date = ? AND shift_code = ? AND check_in IS NOT NULL
       LIMIT 1 FOR UPDATE`,
      [user.id, checkDate, effectiveShift],
    );
    if (existing.length || modernExisting.length || importedExisting.length) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Bạn đã check-in hôm nay rồi.' });
    }

    const isLate = 0;
    const lateMinutes = 0;
    const fullDateTime = `${checkDate} ${checkTime}`;

    await connection.query(
      `INSERT INTO attendance_logs 
       (mssv, full_name, shift, work_date, check_in_time, check_in_image, status, check_in_status, is_late, late_minutes)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'PENDING', ?, ?)`,
      [userMssv, user.full_name, effectiveShift, checkDate, fullDateTime, finalImage, isLate, lateMinutes]
    );

    await connection.commit();
    return res.status(200).json({
      success: true,
      data: { shift_code: effectiveShift, check_in: fullDateTime, is_late: Boolean(isLate), pending_review: true },
      message: 'Check-in thành công, đang chờ quản trị viên duyệt.',
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("CHECK-IN ERROR:", error);
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
  } finally {
    connection?.release();
  }
});

// 2. API CHECK-OUT
router.post('/check-out', authenticate, async (req, res) => {
  let connection;
  try {
    await ensureReviewStatusColumns();
    const { image, imageData, embedding, embeddings, shift } = req.body;
    const currentEmbedding = averageEmbeddings(embeddings) || (validateEmbedding(embedding) ? embedding : null);
    const finalImage = image || imageData || null;
    if (!currentEmbedding) {
      return res.status(400).json({ success: false, message: 'Không nhận diện được khuôn mặt. Hãy nhìn thẳng vào camera và thử lại.' });
    }
    const shiftInfo = await getShiftAvailability(shift);
    if (!shiftInfo) {
      return res.status(400).json({ success: false, message: 'Chỉ được check-out từ 5 phút trước giờ hết ca đến trước giờ bắt đầu ca tiếp theo.' });
    }
    const checkDate = shiftInfo.date;
    const fullDateTime = `${checkDate} ${shiftInfo.time}`;

    connection = await db.getConnection();
    await connection.beginTransaction();
    const [users] = await connection.query(
      'SELECT id, username, student_code, full_name, face_embedding FROM users WHERE id = ? FOR UPDATE',
      [req.user.userId],
    );
    const user = users[0];
    if (!user) {
      await connection.rollback();
      return res.status(401).json({ success: false, message: 'Không tìm thấy tài khoản đăng nhập.' });
    }
    const storedEmbedding = parseFaceEmbedding(user.face_embedding);
    if (!storedEmbedding) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Tài khoản chưa có dữ liệu khuôn mặt hợp lệ. Hãy đăng ký khuôn mặt rồi thử lại.',
        errorCode: 'FACE_NOT_REGISTERED',
      });
    }
    const matchDistance = faceDistance(currentEmbedding, storedEmbedding);
    if (matchDistance > env.faceMatchDistanceThreshold) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Khuôn mặt không khớp với tài khoản.', errorCode: 'FACE_MISMATCH' });
    }
    const identifiers = [...new Set([user.username, user.student_code].filter(Boolean))];
    const placeholders = identifiers.map(() => '?').join(', ');
    const [rows] = await connection.query(
      `SELECT id, check_out_time FROM attendance_logs
       WHERE mssv IN (${placeholders}) AND work_date = ? AND shift = ?
         AND check_in_time IS NOT NULL
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [...identifiers, checkDate, shift],
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Bạn chưa check-in ca này nên không thể check-out.' });
    }
    if (rows[0].check_out_time) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Bạn đã check-out ca này rồi. Mỗi ca chỉ được check-out một lần.' });
    }
    const [updateResult] = await connection.query(
      `UPDATE attendance_logs
       SET check_out_time = ?, check_out_image = ?, check_out_status = 'PENDING', status = 'PENDING'
       WHERE id = ? AND check_out_time IS NULL`,
      [fullDateTime, finalImage, rows[0].id]
    );
    if (!updateResult.affectedRows) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Ca này đã được check-out trước đó.' });
    }

    await connection.commit();
    return res.status(200).json({
      success: true,
      data: { shift_code: shift, check_out: fullDateTime },
      message: 'Xác nhận check-out thành công! Chờ Admin phê duyệt.'
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("CHECK-OUT ERROR:", error);
    return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
  } finally {
    connection?.release();
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




// Thêm lại các route GET bị thiếu
router.get('/today', authenticate, async (req, res) => {
  try {
    const { date } = getVietnamDateTime();
    const [users] = await db.query(
      'SELECT username, student_code, full_name FROM users WHERE id = ? LIMIT 1',
      [req.user.userId],
    );
    if (!users[0]) return res.status(401).json({ success: false, message: 'Không tìm thấy tài khoản đăng nhập.' });
    const identifiers = [...new Set([users[0].username, users[0].student_code].filter(Boolean))];
    const placeholders = identifiers.map(() => '?').join(', ');
    const [rows] = await db.query(
      `SELECT id, work_date as attendance_date, shift as shift_code, shift as shift_name,
              check_in_time as check_in, check_out_time as check_out, status, is_late, late_minutes
       FROM attendance_logs 
       WHERE mssv IN (${placeholders}) AND work_date = ?
       ORDER BY check_in_time DESC LIMIT 1`,
      [...identifiers, date]
    );
    return res.json({ success: true, data: rows[0] || null });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/shifts/today', authenticate, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const [rows] = await db.query(
      `SELECT id, name, start_time, end_time, is_active
       FROM shifts
       ORDER BY FIELD(id, 'MORNING', 'AFTERNOON', 'EVENING')`,
    );
    const { time } = getVietnamDateTime();
    const currentSeconds = toSeconds(time);
    const allShifts = rows.map((row) => {
      const startSeconds = toSeconds(row.start_time);
      const endSeconds = toSeconds(row.end_time);
      const nextShiftStartSeconds = rows
        .filter((nextShift) => toSeconds(nextShift.start_time) >= endSeconds)
        .map((nextShift) => toSeconds(nextShift.start_time))
        .sort((left, right) => left - right)[0] ?? 24 * 60 * 60;
      const isActive = Number(row.is_active) === 1;
      return {
        code: row.id,
        name: {
          MORNING: 'Ca Sáng',
          AFTERNOON: 'Ca Chiều',
          EVENING: 'Ca Tối',
        }[row.id] || row.name,
        start: row.start_time,
        end: row.end_time,
        isActive,
        ...getShiftAttendanceState(
          currentSeconds,
          startSeconds,
          endSeconds,
          isActive,
          nextShiftStartSeconds,
        ),
      };
    });
    const shifts = allShifts.filter((shift) => shift.isActive);
    const isOpen = (shiftCode) => shifts.some((shift) => shift.code === shiftCode);
    return res.json({
      success: true,
      data: {
        shifts,
        allShifts,
        morningEnabled: isOpen('MORNING'),
        afternoonEnabled: isOpen('AFTERNOON'),
        eveningEnabled: isOpen('EVENING'),
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/my', authenticate, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, max-age=0');
    const [rows] = await db.query(
      `SELECT history.* FROM (
         SELECT a.id, a.work_date AS attendance_date,
                a.shift COLLATE utf8mb4_unicode_ci AS shift_code,
                a.shift COLLATE utf8mb4_unicode_ci AS shift_name,
                a.check_in_time AS check_in, a.check_out_time AS check_out,
                a.status COLLATE utf8mb4_unicode_ci AS status, a.is_late, a.late_minutes,
                IF(a.check_in_image IS NOT NULL, 1, 0) AS check_in_photo_available,
                IF(a.check_out_image IS NOT NULL, 1, 0) AS check_out_photo_available,
                NULL AS check_in_photo_expired, NULL AS check_out_photo_expired,
                NULL AS check_in_captured_at, NULL AS check_out_captured_at,
                NULL AS check_in_event_status, NULL AS check_out_event_status,
                'Camera Request' COLLATE utf8mb4_unicode_ci AS source
         FROM attendance_logs a
         JOIN users u ON u.id = ?
         WHERE a.mssv COLLATE utf8mb4_unicode_ci = u.username COLLATE utf8mb4_unicode_ci
            OR (u.student_code IS NOT NULL
                AND a.mssv COLLATE utf8mb4_unicode_ci = u.student_code COLLATE utf8mb4_unicode_ci)

         UNION ALL

         SELECT a.id, a.attendance_date,
                a.shift_code COLLATE utf8mb4_unicode_ci AS shift_code,
                a.shift_name COLLATE utf8mb4_unicode_ci AS shift_name,
                a.check_in, a.check_out, a.status COLLATE utf8mb4_unicode_ci AS status,
                a.is_late, a.late_minutes,
                IF(ci.image IS NOT NULL OR a.check_in_image IS NOT NULL, 1, 0) AS check_in_photo_available,
                IF(co.image IS NOT NULL OR a.check_out_image IS NOT NULL, 1, 0) AS check_out_photo_available,
                ci.photo_expired AS check_in_photo_expired, co.photo_expired AS check_out_photo_expired,
                ci.captured_at AS check_in_captured_at, co.captured_at AS check_out_captured_at,
                ci.status COLLATE utf8mb4_unicode_ci AS check_in_event_status,
                co.status COLLATE utf8mb4_unicode_ci AS check_out_event_status,
                'Camera' COLLATE utf8mb4_unicode_ci AS source
         FROM attendance a
         LEFT JOIN attendance_events ci ON ci.attendance_id = a.id AND ci.event_type = 'CHECK_IN'
         LEFT JOIN attendance_events co ON co.attendance_id = a.id AND co.event_type = 'CHECK_OUT'
         WHERE a.user_id = ?

         UNION ALL

         SELECT r.id, r.attendance_date,
                r.shift_code COLLATE utf8mb4_unicode_ci AS shift_code,
                r.shift_name COLLATE utf8mb4_unicode_ci AS shift_name,
                r.check_in, r.check_out, r.status COLLATE utf8mb4_unicode_ci AS status,
                0 AS is_late, 0 AS late_minutes,
                0 AS check_in_photo_available, 0 AS check_out_photo_available,
                NULL AS check_in_photo_expired, NULL AS check_out_photo_expired,
                NULL AS check_in_captured_at, NULL AS check_out_captured_at,
                NULL AS check_in_event_status, NULL AS check_out_event_status,
                'Excel Import' COLLATE utf8mb4_unicode_ci AS source
         FROM imported_attendance_records r
         WHERE r.user_id = ?
       ) history
       ORDER BY history.attendance_date DESC, history.check_in DESC
       LIMIT 1000`,
      [req.user.userId, req.user.userId, req.user.userId]
    );
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:attendanceId/image/:type', authenticate, async (req, res) => {
  try {
    const source = req.query.source;
    const imageColumn = req.params.type === 'check-in'
      ? 'check_in_image'
      : req.params.type === 'check-out'
        ? 'check_out_image'
        : null;
    if (!imageColumn) {
      return res.status(400).json({ success: false, message: 'Loại ảnh không hợp lệ.' });
    }
    if (!source || source === 'Camera Request') {
      const [legacyRows] = await db.query(
        `SELECT a.${imageColumn} AS image
         FROM attendance_logs a
         JOIN users u ON u.id = ?
         WHERE a.id = ?
           AND (
             a.mssv COLLATE utf8mb4_unicode_ci = u.username COLLATE utf8mb4_unicode_ci
             OR (u.student_code IS NOT NULL
                 AND a.mssv COLLATE utf8mb4_unicode_ci = u.student_code COLLATE utf8mb4_unicode_ci)
           )
         LIMIT 1`,
        [req.user.userId, req.params.attendanceId],
      );
      if (legacyRows[0]?.image) {
        const image = String(legacyRows[0].image);
        return res.json({
          success: true,
          data: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`,
        });
      }
    }

    if (source && source !== 'Camera') {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ảnh chấm công.' });
    }
    const eventType = req.params.type === 'check-in' ? 'CHECK_IN' : 'CHECK_OUT';
    const eventImageColumn = req.params.type === 'check-in' ? 'check_in_image' : 'check_out_image';
    const [modernRows] = await db.query(
      `SELECT COALESCE(e.image, a.${eventImageColumn}) AS image,
              COALESCE(e.image_mime, 'image/jpeg') AS image_mime
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN attendance_events e
         ON e.attendance_id = a.id AND e.event_type = ?
       WHERE u.id = ? AND a.id = ?
       LIMIT 1`,
      [eventType, req.user.userId, req.params.attendanceId],
    );
    if (!modernRows[0]?.image) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ảnh chấm công.' });
    }
    const image = Buffer.isBuffer(modernRows[0].image)
      ? modernRows[0].image.toString('base64')
      : String(modernRows[0].image).replace(/^data:[^;]+;base64,/, '');
    return res.json({
      success: true,
      data: `data:${modernRows[0].image_mime || 'image/jpeg'};base64,${image}`,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
