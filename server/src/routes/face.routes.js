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

const router = Router();

router.post('/register', authenticate, async (request, response, next) => {
  let connection;
  try {
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

export default router;
