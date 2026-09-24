import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/login', async (request, response, next) => {
  try {
    const { username, password } = request.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return response.status(400).json({
        success: false,
        message: 'Vui lòng nhập tên đăng nhập và mật khẩu.',
        errorCode: 'VALIDATION_ERROR',
      });
    }

    const [rows] = await pool.execute(
      'SELECT id, full_name, username, password_hash, role, face_registered, must_change_password, total_work_days, phone, address, hometown_province_code, hometown_province_name FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1',
      [username.trim()],
    );
    const user = rows[0];
    const passwordMatches = user
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!user || !passwordMatches) {
      return response.status(401).json({
        success: false,
        message: 'Tên đăng nhập hoặc mật khẩu không đúng.',
        errorCode: 'INVALID_CREDENTIALS',
      });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, username: user.username },
      env.jwtSecret,
      { expiresIn: '8h' },
    );

    return response.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          fullName: user.full_name,
          username: user.username,
          role: user.role,
          faceRegistered: Boolean(user.face_registered),
          mustChangePassword: Boolean(user.must_change_password),
          totalWorkDays: Number(user.total_work_days || 0),
          phone: user.phone,
          address: user.address,
          hometownProvinceCode: user.hometown_province_code,
          hometownProvinceName: user.hometown_province_name,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/me', authenticate, async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, full_name, username, role, face_registered, total_work_days, phone, address, hometown_province_code, hometown_province_name FROM users WHERE id = ? LIMIT 1',
      [request.user.userId],
    );
    if (!rows[0]) {
      return response.status(404).json({ success: false, message: 'Không tìm thấy người dùng.' });
    }
    return response.json({ success: true, data: rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.patch('/profile', authenticate, async (request, response, next) => {
  try {
    const { fullName, phone, address, hometownProvinceCode, hometownProvinceName } = request.body;
    if (!fullName?.trim()) {
      return response.status(400).json({ success: false, message: 'Họ và tên không được để trống.', errorCode: 'VALIDATION_ERROR' });
    }
    if (phone && !/^[0-9+()\-\s]{8,20}$/.test(phone.trim())) {
      return response.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.', errorCode: 'VALIDATION_ERROR' });
    }
    await pool.execute(
      `UPDATE users
       SET full_name = ?, phone = ?, address = ?, hometown_province_code = ?, hometown_province_name = ?
       WHERE id = ?`,
      [
        fullName.trim(),
        phone?.trim() || null,
        address?.trim() || null,
        hometownProvinceCode || null,
        hometownProvinceName?.trim() || null,
        request.user.userId,
      ],
    );
    const [rows] = await pool.execute(
      'SELECT id, full_name, username, role, face_registered, phone, address, hometown_province_code, hometown_province_name FROM users WHERE id = ? LIMIT 1',
      [request.user.userId],
    );
    return response.json({ success: true, data: rows[0], message: 'Đã cập nhật thông tin cá nhân.' });
  } catch (error) {
    return next(error);
  }
});

router.patch('/password', authenticate, async (request, response, next) => {
  try {
    const { currentPassword, newPassword } = request.body;
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return response.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự.', errorCode: 'VALIDATION_ERROR' });
    }
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [request.user.userId]);
    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return response.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng.', errorCode: 'INVALID_PASSWORD' });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.execute('UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?', [passwordHash, request.user.userId]);
    return response.json({ success: true, message: 'Đã đổi mật khẩu thành công.' });
  } catch (error) {
    return next(error);
  }
});

export default router;
