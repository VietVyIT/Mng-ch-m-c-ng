import { Router } from 'express';
import { pool } from '../config/database.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { cosineSimilarity, validateEmbedding } from '../utils/face.js';
import { env } from '../config/env.js';
import { DEFAULT_SHIFTS, getCurrentShift, checkLateStatus } from '../config/shifts.js';

const router = Router();
const MAX_IMAGE_BYTES = 30 * 1024;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

function parseImage(imageData) {
  if (typeof imageData !== 'string') return null;
  const match = imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
  return { buffer, mime: match[1] };
}

async function purgeExpiredPhotos() {
  await pool.execute(
    `UPDATE attendance_events
     SET image = NULL, photo_expired = TRUE
     WHERE image IS NOT NULL AND captured_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
  );
  return pool.execute(
    `UPDATE attendance a
     SET photo_expired = TRUE
     WHERE photo_expired = FALSE
       AND EXISTS (
         SELECT 1 FROM attendance_events e
         WHERE e.attendance_id = a.id AND e.photo_expired = TRUE
       )`,
  );
}

async function verifyUserFace(userId, embedding) {
  if (!validateEmbedding(embedding)) return false;
  const [rows] = await pool.execute('SELECT face_embedding FROM users WHERE id = ? LIMIT 1', [userId]);
  const stored = rows[0]?.face_embedding;
  let storedEmbedding;
  try {
    storedEmbedding = typeof stored === 'string' ? JSON.parse(stored) : stored;
  } catch {
    return false;
  }
  return validateEmbedding(storedEmbedding) && cosineSimilarity(embedding, storedEmbedding) >= env.faceMatchThreshold;
}

async function getTodayShift() {
  const [rows] = await pool.execute(
    'SELECT evening_enabled FROM shift_day_settings WHERE setting_date = CURRENT_DATE LIMIT 1',
  );
  return { eveningEnabled: rows[0]?.evening_enabled !== 0, shifts: DEFAULT_SHIFTS.filter((shift) => shift.code !== 'EVENING' || rows[0]?.evening_enabled !== 0) };
}

router.get('/shifts/today', authenticate, async (_request, response, next) => {
  try {
    const data = await getTodayShift();
    return response.json({ success: true, data: { ...data, current: getCurrentShift(new Date(), data.eveningEnabled) } });
  } catch (error) {
    return next(error);
  }
});

router.get('/today', authenticate, async (request, response, next) => {
  try {
    await purgeExpiredPhotos();
    const [rows] = await pool.execute(
      `SELECT id, attendance_date, shift_code, shift_name, shift_start, shift_end,
              check_in, check_out, total_hours, status, punctuality_status, is_late, late_minutes,
              face_verified, photo_expired
       FROM attendance WHERE user_id = ? AND attendance_date = CURRENT_DATE LIMIT 1`,
      [request.user.userId],
    );
    return response.json({ success: true, data: rows[0] || null });
  } catch (error) {
    return next(error);
  }
});

router.get('/my', authenticate, async (request, response, next) => {
  try {
    await purgeExpiredPhotos();
    const [rows] = await pool.execute(
      `SELECT id, attendance_date, shift_code, shift_name, shift_start, shift_end,
              check_in, check_out, total_hours, status, punctuality_status, is_late, late_minutes,
              face_verified, photo_expired,
              (SELECT total_work_days FROM users WHERE id = attendance.user_id) AS total_work_days,
              (SELECT captured_at FROM attendance_events e WHERE e.attendance_id = attendance.id AND e.event_type = 'CHECK_IN' ORDER BY e.captured_at DESC LIMIT 1) AS check_in_captured_at,
              (SELECT captured_at FROM attendance_events e WHERE e.attendance_id = attendance.id AND e.event_type = 'CHECK_OUT' ORDER BY e.captured_at DESC LIMIT 1) AS check_out_captured_at,
              (SELECT status FROM attendance_events e WHERE e.attendance_id = attendance.id AND e.event_type = 'CHECK_IN' ORDER BY e.captured_at DESC LIMIT 1) AS check_in_event_status,
              (SELECT status FROM attendance_events e WHERE e.attendance_id = attendance.id AND e.event_type = 'CHECK_OUT' ORDER BY e.captured_at DESC LIMIT 1) AS check_out_event_status,
              (SELECT COUNT(*) FROM attendance_events e WHERE e.attendance_id = attendance.id AND e.event_type = 'CHECK_IN' AND e.image IS NOT NULL) AS check_in_photo_available,
              (SELECT COUNT(*) FROM attendance_events e WHERE e.attendance_id = attendance.id AND e.event_type = 'CHECK_OUT' AND e.image IS NOT NULL) AS check_out_photo_available
       FROM attendance WHERE user_id = ? ORDER BY attendance_date DESC, check_in DESC LIMIT 100`,
      [request.user.userId],
    );
    const [importedRows] = await pool.execute(
      `SELECT id, attendance_date, shift_code, shift_name, shift_start, shift_end,
              check_in, check_out, total_hours, status, NULL AS punctuality_status, FALSE AS is_late, 0 AS late_minutes,
              FALSE AS face_verified, TRUE AS imported_from_excel,
              (SELECT total_work_days FROM users WHERE id = imported_attendance_records.user_id) AS total_work_days,
              check_in AS check_in_captured_at, check_out AS check_out_captured_at,
              NULL AS check_in_event_status, NULL AS check_out_event_status,
              0 AS check_in_photo_available, 0 AS check_out_photo_available
       FROM imported_attendance_records
       WHERE user_id = ?
       ORDER BY attendance_date DESC, check_in DESC LIMIT 500`,
      [request.user.userId],
    );
    return response.json({ success: true, data: [...rows, ...importedRows].sort((a, b) => new Date(b.attendance_date) - new Date(a.attendance_date)) });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/image/:type', authenticate, async (request, response, next) => {
  try {
    await purgeExpiredPhotos();
    const eventType = request.params.type === 'check-in' ? 'CHECK_IN' : request.params.type === 'check-out' ? 'CHECK_OUT' : null;
    if (!eventType) return response.status(400).json({ success: false, message: 'Loại ảnh không hợp lệ.' });
    const [rows] = await pool.execute(
      `SELECT image, image_mime FROM attendance_events
       WHERE attendance_id = ? AND user_id = ? AND event_type = ?
       ORDER BY captured_at DESC LIMIT 1`,
      [request.params.id, request.user.userId, eventType],
    );
    if (!rows[0]?.image) return response.status(404).json({ success: false, message: 'Ảnh đã hết hạn hoặc không tồn tại.' });
    return response.type(rows[0].image_mime || 'image/jpeg').send(rows[0].image);
  } catch (error) {
    return next(error);
  }
});

async function createAttendanceEvent(request, eventType, response) {
  const image = parseImage(request.body.imageData);
  if (!image) {
    return response.status(400).json({ success: false, message: 'Ảnh sau khi nén phải nhỏ hơn hoặc bằng 30KB.', errorCode: 'INVALID_IMAGE_SIZE' });
  }
  if (!(await verifyUserFace(request.user.userId, request.body.embedding))) {
    return response.status(403).json({ success: false, message: 'Khuôn mặt không khớp.', errorCode: 'FACE_NOT_MATCH' });
  }

  const shiftData = await getTodayShift();
  const shift = getCurrentShift(new Date(), shiftData.eveningEnabled);
  if (!shift) return response.status(409).json({ success: false, message: 'Hiện không có ca làm việc nào được bật.', errorCode: 'NO_ENABLED_SHIFT' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id, check_in, check_out FROM attendance WHERE user_id = ? AND attendance_date = CURRENT_DATE FOR UPDATE',
      [request.user.userId],
    );
    let attendance = rows[0];
    if (eventType === 'CHECK_IN' && attendance?.check_in) {
      await connection.rollback();
      return response.status(409).json({ success: false, message: 'Bạn đã check-in hôm nay.', errorCode: 'ALREADY_CHECKED_IN' });
    }
    if (eventType === 'CHECK_OUT' && (!attendance?.check_in || attendance?.check_out)) {
      await connection.rollback();
      return response.status(409).json({ success: false, message: attendance?.check_out ? 'Bạn đã check-out hôm nay.' : 'Bạn chưa check-in hôm nay.', errorCode: 'CHECK_IN_REQUIRED' });
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    let checkInLateInfo = { isLate: false, punctualityStatus: 'ON_TIME', lateMinutes: 0 };

    if (!attendance) {
      checkInLateInfo = checkLateStatus(shift, now);
      const [insert] = await connection.execute(
        `INSERT INTO attendance
         (user_id, attendance_date, shift_code, shift_name, shift_start, shift_end, check_in, status, punctuality_status, is_late, late_minutes, face_verified)
         VALUES (?, CURRENT_DATE, ?, ?, ?, ?, NOW(), 'PENDING', ?, ?, ?, TRUE)`,
        [request.user.userId, shift.code, shift.name, shift.start, shift.end, checkInLateInfo.punctualityStatus, checkInLateInfo.isLate, checkInLateInfo.lateMinutes],
      );
      attendance = { id: insert.insertId, check_in: true };
    } else if (eventType === 'CHECK_OUT') {
      await connection.execute(
        "UPDATE attendance SET check_out = NOW(), total_hours = ROUND(TIMESTAMPDIFF(MINUTE, check_in, NOW()) / 60, 2), status = 'PENDING' WHERE id = ?",
        [attendance.id],
      );
    }

    await connection.execute(
      `INSERT INTO attendance_events
       (attendance_id, user_id, event_type, image, image_mime, face_verified, is_late, punctuality_status, status)
       VALUES (?, ?, ?, ?, ?, TRUE, ?, ?, 'PENDING')`,
      [attendance.id, request.user.userId, eventType, image.buffer, image.mime, checkInLateInfo.isLate, checkInLateInfo.punctualityStatus],
    );
    await connection.commit();

    let responseMessage;
    if (eventType === 'CHECK_IN') {
      responseMessage = checkInLateInfo.isLate
        ? `Bạn đã check-in trễ lúc ${timeStr}. Yêu cầu chấm công đã được gửi tới Quản trị viên để xét duyệt.`
        : `Check-in thành công lúc ${timeStr}, đang chờ quản trị viên duyệt.`;
    } else {
      responseMessage = `Check-out thành công lúc ${timeStr}, đang chờ quản trị viên duyệt.`;
    }

    return response.status(eventType === 'CHECK_IN' ? 201 : 200).json({
      success: true,
      status: 'PENDING',
      is_late: checkInLateInfo.isLate,
      punctuality_status: checkInLateInfo.punctualityStatus,
      late_minutes: checkInLateInfo.lateMinutes,
      check_in_time: eventType === 'CHECK_IN' ? now.toISOString() : undefined,
      check_out_time: eventType === 'CHECK_OUT' ? now.toISOString() : undefined,
      message: responseMessage,
      data: {
        attendance_id: attendance.id,
        status: 'PENDING',
        is_late: checkInLateInfo.isLate,
        punctuality_status: checkInLateInfo.punctualityStatus,
      },
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

router.post('/check-in', authenticate, async (request, response, next) => {
  try {
    return await createAttendanceEvent(request, 'CHECK_IN', response);
  } catch (error) {
    return next(error);
  }
});

router.post('/check-out', authenticate, async (request, response, next) => {
  try {
    return await createAttendanceEvent(request, 'CHECK_OUT', response);
  } catch (error) {
    return next(error);
  }
});

export default router;
