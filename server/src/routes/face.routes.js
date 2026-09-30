import { Router } from 'express';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import {
  averageEmbeddings,
  faceDistance,
  parseFaceEmbedding,
  validateEmbedding,
} from '../utils/face.js';
import { notifyAdministrators } from '../utils/notifications.js';

const router = Router();

router.post('/register', authenticate, async (request, response, next) => {
  let connection;
  try {
    if (request.user.role !== 'ADMIN') {
      return response.status(403).json({
        success: false,
        message: 'Yêu cầu đăng ký lại khuôn mặt cần được Admin duyệt.',
        errorCode: 'FACE_REVIEW_REQUIRED',
      });
    }
    const { embedding, embeddings } = request.body;
    const currentEmbedding = averageEmbeddings(embeddings) || (validateEmbedding(embedding) ? embedding : null);
    if (!currentEmbedding) {
      return response.status(400).json({ success: false, message: 'Embedding khuôn mặt không hợp lệ.', errorCode: 'INVALID_EMBEDDING' });
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT face_embedding, face_registered FROM users WHERE id = ? FOR UPDATE',
      [request.user.userId],
    );
    if (!rows.length) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
    }
    const stored = parseFaceEmbedding(rows[0].face_embedding);
    if (stored) {
      if (faceDistance(currentEmbedding, stored) <= env.faceMatchDistanceThreshold) {
        if (!rows[0].face_registered) {
          await connection.execute(
            'UPDATE users SET face_registered = TRUE WHERE id = ?',
            [request.user.userId],
          );
        }
        await connection.commit();
        return response.json({ success: true, message: 'Khuôn mặt đã được đăng ký.' });
      }
      await connection.rollback();
      return response.status(409).json({
        success: false,
        message: 'Khuôn mặt không khớp với khuôn mặt đã đăng ký.',
        errorCode: 'FACE_MISMATCH',
      });
    }
    await connection.execute(
      'UPDATE users SET face_embedding = ?, face_registered = TRUE WHERE id = ?',
      [JSON.stringify(currentEmbedding), request.user.userId],
    );
    await connection.commit();
    return response.json({ success: true, message: 'Đăng ký khuôn mặt thành công.' });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.post('/register/replace', authenticate, async (request, response, next) => {
  try {
    if (request.user.role !== 'ADMIN') {
      return response.status(403).json({
        success: false,
        message: 'Thành viên cần gửi yêu cầu để Admin duyệt khi đăng ký lại khuôn mặt.',
        errorCode: 'FACE_REVIEW_REQUIRED',
      });
    }
    const { embedding, embeddings } = request.body;
    const currentEmbedding = averageEmbeddings(embeddings) || (validateEmbedding(embedding) ? embedding : null);
    if (!currentEmbedding) {
      return response.status(400).json({ success: false, message: 'Embedding khuôn mặt không hợp lệ.', errorCode: 'INVALID_EMBEDDING' });
    }
    const [result] = await pool.execute(
      'UPDATE users SET face_embedding = ?, face_registered = TRUE WHERE id = ?',
      [JSON.stringify(currentEmbedding), request.user.userId],
    );
    if (!result.affectedRows) {
      const [users] = await pool.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [request.user.userId]);
      if (!users.length) {
        return response.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
      }
    }
    return response.json({ success: true, message: 'Đã cập nhật khuôn mặt. Hãy thử chấm công lại.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/verify', authenticate, async (request, response, next) => {
  try {
    const { embedding, embeddings } = request.body;
    const currentEmbedding = averageEmbeddings(embeddings) || (validateEmbedding(embedding) ? embedding : null);
    if (!currentEmbedding) {
      return response.status(400).json({ success: false, message: 'Embedding khuôn mặt không hợp lệ.', errorCode: 'INVALID_EMBEDDING' });
    }
    const [rows] = await pool.execute(
      'SELECT face_embedding FROM users WHERE id = ? LIMIT 1',
      [request.user.userId],
    );
    const storedEmbedding = parseFaceEmbedding(rows[0]?.face_embedding);
    if (!storedEmbedding) {
      return response.status(409).json({ success: false, message: 'Bạn chưa đăng ký khuôn mặt.', errorCode: 'FACE_NOT_REGISTERED' });
    }
    const distance = faceDistance(currentEmbedding, storedEmbedding);
    return response.json({
      success: true,
      data: {
        verified: distance <= env.faceMatchDistanceThreshold,
        distance,
        threshold: env.faceMatchDistanceThreshold,
      },
    });
  } catch (error) {
    return next(error);
  }
});
router.post('/register/request', authenticate, async (request, response, next) => {
  let connection;
  try {
    if (request.user.role !== 'USER') {
      return response.status(403).json({
        success: false,
        message: 'Chỉ tài khoản thành viên mới gửi yêu cầu duyệt khuôn mặt.',
        errorCode: 'FORBIDDEN',
      });
    }
    const { embedding, embeddings, image } = request.body;
    const currentEmbedding = averageEmbeddings(embeddings) || (validateEmbedding(embedding) ? embedding : null);
    if (!currentEmbedding) {
      return response.status(400).json({ success: false, message: 'Embedding khuôn mặt không hợp lệ.', errorCode: 'INVALID_EMBEDDING' });
    }
    if (image != null && (typeof image !== 'string' || image.length > 2_000_000)) {
      return response.status(400).json({ success: false, message: 'Ảnh khuôn mặt không hợp lệ hoặc vượt quá dung lượng cho phép.' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [users] = await connection.execute(
      "SELECT id, full_name, student_code FROM users WHERE id = ? AND role = 'USER' FOR UPDATE",
      [request.user.userId],
    );
    if (!users.length) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy tài khoản thành viên.' });
    }

    const [existing] = await connection.execute(
      'SELECT id FROM face_re_registration_requests WHERE user_id = ? AND status = ? LIMIT 1 FOR UPDATE',
      [request.user.userId, 'PENDING']
    );
    if (existing.length > 0) {
      await connection.rollback();
      return response.status(409).json({ success: false, message: 'Bạn đã có một yêu cầu đăng ký lại khuôn mặt đang chờ admin duyệt.' });
    }

    await connection.execute(
      'INSERT INTO face_re_registration_requests (user_id, new_face_embedding, new_face_image, status) VALUES (?, ?, ?, ?)',
      [request.user.userId, JSON.stringify(currentEmbedding), image || null, 'PENDING']
    );
    const user = users[0];
    const studentLabel = user.student_code ? ` (${user.student_code})` : '';
    await notifyAdministrators(connection, {
      type: 'FACE_REGISTRATION_REQUEST',
      title: 'Yêu cầu đăng ký lại khuôn mặt',
      message: `${user.full_name}${studentLabel} gửi yêu cầu cập nhật khuôn mặt, đang chờ duyệt.`,
    });

    await connection.commit();
    return response.json({ success: true, message: 'Đã gửi yêu cầu đăng ký lại khuôn mặt, vui lòng chờ admin duyệt.' });
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

router.get('/register/my-request', authenticate, async (request, response, next) => {
  try {
    if (request.user.role !== 'USER') {
      return response.status(403).json({ success: false, message: 'Chức năng này chỉ dành cho tài khoản thành viên.' });
    }
    const [rows] = await pool.execute(
      'SELECT id, status, rejection_reason, created_at, reviewed_at FROM face_re_registration_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      [request.user.userId]
    );
    if (!rows.length) {
      return response.json({ success: true, data: null });
    }
    return response.json({ success: true, data: rows[0] });
  } catch (error) {
    return next(error);
  }
});

export default router;
