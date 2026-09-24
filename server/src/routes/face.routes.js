import { Router } from 'express';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { cosineSimilarity, validateEmbedding } from '../utils/face.js';

const router = Router();

router.post('/register', authenticate, async (request, response, next) => {
  try {
    const { embedding } = request.body;
    if (!validateEmbedding(embedding)) {
      return response.status(400).json({ success: false, message: 'Embedding khuôn mặt không hợp lệ.', errorCode: 'INVALID_EMBEDDING' });
    }
    await pool.execute('UPDATE users SET face_embedding = ?, face_registered = TRUE WHERE id = ?', [JSON.stringify(embedding), request.user.userId]);
    return response.json({ success: true, message: 'Đăng ký khuôn mặt thành công.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/verify', authenticate, async (request, response, next) => {
  try {
    const { embedding } = request.body;
    if (!validateEmbedding(embedding)) {
      return response.status(400).json({ success: false, message: 'Embedding khuôn mặt không hợp lệ.', errorCode: 'INVALID_EMBEDDING' });
    }
    const [rows] = await pool.execute('SELECT face_embedding FROM users WHERE id = ? LIMIT 1', [request.user.userId]);
    const stored = rows[0]?.face_embedding;
    const storedEmbedding = typeof stored === 'string' ? JSON.parse(stored) : stored;
    if (!validateEmbedding(storedEmbedding)) {
      return response.status(409).json({ success: false, message: 'Bạn chưa đăng ký khuôn mặt.', errorCode: 'FACE_NOT_REGISTERED' });
    }
    const score = cosineSimilarity(embedding, storedEmbedding);
    return response.json({ success: true, data: { verified: score >= env.faceMatchThreshold, score, threshold: env.faceMatchThreshold } });
  } catch (error) {
    return next(error);
  }
});

export default router;
