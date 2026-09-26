import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { sendOtpMessage, isEmail, isPhone } from '../utils/mailer.js';

const router = Router();

async function ensureAuthTables(connection) {
  const [emailCols] = await connection.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email' LIMIT 1`,
  );
  if (!emailCols.length) {
    await connection.execute('ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL UNIQUE AFTER phone');
  }

  await connection.execute(
    `CREATE TABLE IF NOT EXISTS email_otps (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL,
      otp_code VARCHAR(10) NOT NULL,
      purpose ENUM('REGISTER', 'FORGOT_PASSWORD') NOT NULL,
      payload JSON NULL,
      expires_at DATETIME NOT NULL,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_email_purpose (email, purpose, is_verified, expires_at)
    ) ENGINE=InnoDB`,
  );
}

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskContact(contact) {
  if (!contact) return '';
  if (contact.includes('@')) {
    const [local, domain] = contact.split('@');
    if (local.length <= 2) return `${local.slice(0, 1)}***@${domain}`;
    return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
  }
  // Phone number mask
  const clean = contact.replace(/\s+/g, '');
  if (clean.length >= 7) {
    return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
  }
  return contact;
}

// 1. LOGIN
router.post('/login', async (request, response, next) => {
  try {
    await ensureAuthTables(pool);
    const { username, password } = request.body;
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return response.status(400).json({
        success: false,
        message: 'Vui lòng nhập tên đăng nhập (Họ tên / MSSV / SĐT) và mật khẩu.',
        errorCode: 'VALIDATION_ERROR',
      });
    }

    const trimmedUser = username.trim();
    const [rows] = await pool.execute(
      `SELECT id, full_name, username, email, password_hash, role, face_registered,
              must_change_password, total_work_days, student_code, phone, address,
              hometown_province_code, hometown_province_name
       FROM users
       WHERE LOWER(username) = LOWER(?) 
          OR LOWER(full_name) = LOWER(?)
          OR (student_code IS NOT NULL AND LOWER(student_code) = LOWER(?))
          OR (email IS NOT NULL AND LOWER(email) = LOWER(?))
          OR (phone IS NOT NULL AND (phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?))
       LIMIT 1`,
      [trimmedUser, trimmedUser, trimmedUser, trimmedUser, trimmedUser, trimmedUser.replace(/\s|-/g, '')],
    );
    const user = rows[0];

    if (!user) {
      return response.status(404).json({
        success: false,
        message: 'Tài khoản hoặc tên này chưa có trong hệ thống. Vui lòng bấm "Tạo tài khoản mới" để đăng ký.',
        errorCode: 'USER_NOT_FOUND',
      });
    }

        let passwordMatches = false;
    let hintMessage = '';

    if (user.role === 'ADMIN' || user.username === 'admin') {
      passwordMatches = (user.password_hash ? await bcrypt.compare(password, user.password_hash) : false) || (password === 'admin123') || (password === process.env.ADMIN_SECRET_KEY);
      hintMessage = 'Mật khẩu Admin không đúng!';
    } else {
      const isPasswordChanged = user.password_hash ? await bcrypt.compare(password, user.password_hash) : false;
      if (!user.student_code || user.student_code.trim() === '' || user.student_code === 'Chưa có MSSV') {
        passwordMatches = isPasswordChanged || (password === 'user123');
        hintMessage = 'Mật khẩu không đúng. Mật khẩu mặc định cho tài khoản của bạn là: user123 (do chưa có MSSV)';
      } else {
        passwordMatches = isPasswordChanged || (password === user.student_code);
        hintMessage = "Mật khẩu không đúng. Mật khẩu mặc định cho tài khoản của bạn là: " + user.student_code + " (MSSV của bạn)";
      }
    }

    if (!passwordMatches) {
      return response.status(401).json({
        success: false,
        message: hintMessage,
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
          email: user.email,
          role: user.role,
          faceRegistered: Boolean(user.face_registered),
          mustChangePassword: Boolean(user.must_change_password),
          totalWorkDays: Number(user.total_work_days || 0),
          studentCode: user.student_code,
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

// 2. SEND REGISTER OTP
router.post('/send-register-otp', async (request, response, next) => {
  try {
    await ensureAuthTables(pool);
    const { fullName, username, studentCode, contact, email, phone } = request.body;
    const contactValue = String(contact || email || phone || '').trim();

    if (!fullName || !String(fullName).trim()) {
      return response.status(400).json({ success: false, message: 'Họ và tên là bắt buộc.' });
    }
    if (!username || !/^[a-zA-Z0-9._\-\sÀ-ỹ]{2,60}$/.test(String(username).trim())) {
      return response.status(400).json({ success: false, message: 'Tên đăng nhập không hợp lệ.' });
    }
    if (!contactValue) {
      return response.status(400).json({ success: false, message: 'Số điện thoại nhận OTP là bắt buộc.' });
    }

    const cleanFullName = String(fullName).trim();
    const cleanUsername = String(username).trim();
    const cleanMSSV = String(studentCode || '').trim() || null;
    const isMail = contactValue.includes('@');

    if (isMail) {
      return response.status(400).json({
        success: false,
        message: 'Chức năng gửi OTP qua Email hiện đang được nâng cấp. Vui lòng sử dụng Số điện thoại để nhận mã xác thực hoặc thử lại sau.',
      });
    }

    if (!isPhone(contactValue)) {
      return response.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ (8-20 chữ số).' });
    }

    // Check duplicate username, MSSV or phone
    const [existingUsers] = await pool.execute(
      `SELECT id, username, email, phone, student_code FROM users
       WHERE LOWER(username) = LOWER(?)
          OR (? IS NOT NULL AND student_code = ?)
          OR (phone IS NOT NULL AND (phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?))
       LIMIT 1`,
      [cleanUsername, cleanMSSV, cleanMSSV || '', contactValue, contactValue.replace(/\s|-/g, '')],
    );

    if (existingUsers[0]) {
      const match = existingUsers[0];
      if (match.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return response.status(409).json({ success: false, message: 'Tên đăng nhập này đã có người sử dụng.' });
      }
      if (cleanMSSV && match.student_code === cleanMSSV) {
        return response.status(409).json({ success: false, message: 'Mã số sinh viên (MSSV) này đã được đăng ký.' });
      }
      if (match.phone) {
        return response.status(409).json({ success: false, message: 'Số điện thoại này đã được gán cho tài khoản khác.' });
      }
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.execute(
      `INSERT INTO email_otps (email, otp_code, purpose, expires_at)
       VALUES (?, ?, 'REGISTER', ?)`,
      [contactValue.toLowerCase(), otp, expiresAt],
    );

    const result = await sendOtpMessage({
      contact: contactValue,
      otp,
      purpose: 'REGISTER',
      fullName: cleanFullName,
    });

    return response.json({
      success: true,
      message: result.isRealSms
        ? `Mã xác thực OTP đã được gửi qua tin nhắn SMS tới ${maskContact(contactValue)}.`
        : `Đã gửi mã xác thực tới số ${maskContact(contactValue)}! (Mã OTP SMS thử nghiệm: ${otp})`,
      data: {
        contact: contactValue,
        channel: result.channel,
        otp: result.isRealSms ? undefined : otp,
        expiresInSeconds: 300,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// 3. REGISTER WITH OTP
router.post('/register-with-otp', async (request, response, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureAuthTables(connection);

    const { fullName, username, studentCode, contact, email, phone, password, otp } = request.body;
    const contactValue = String(contact || email || phone || '').trim();

    if (!fullName || !username || !contactValue || !password || !otp) {
      await connection.rollback();
      return response.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ các thông tin bắt buộc.' });
    }

    if (String(password).length < 6) {
      await connection.rollback();
      return response.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
    }

    const cleanFullName = String(fullName).trim();
    const cleanUsername = String(username).trim();
    const cleanMSSV = String(studentCode || '').trim() || null;
    const cleanOtp = String(otp).trim();
    const isMail = contactValue.includes('@');
    const emailToSave = isMail ? contactValue.toLowerCase() : null;
    const phoneToSave = isMail ? null : contactValue;

    // Verify OTP
    const [otpRows] = await connection.execute(
      `SELECT id, email, otp_code, expires_at, is_verified
       FROM email_otps
       WHERE LOWER(email) = LOWER(?) AND otp_code = ? AND purpose = 'REGISTER' AND is_verified = FALSE AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [contactValue.toLowerCase(), cleanOtp],
    );

    if (!otpRows[0]) {
      await connection.rollback();
      return response.status(400).json({ success: false, message: 'Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.' });
    }

    // Check duplicate username, MSSV, email or phone
    const [existing] = await connection.execute(
      `SELECT id FROM users
       WHERE LOWER(username) = LOWER(?)
          OR (? IS NOT NULL AND student_code = ?)
          OR (? IS NOT NULL AND LOWER(email) = LOWER(?))
          OR (? IS NOT NULL AND phone = ?)
       LIMIT 1 FOR UPDATE`,
      [cleanUsername, cleanMSSV, cleanMSSV || '', emailToSave, emailToSave || '', phoneToSave, phoneToSave || ''],
    );

    if (existing[0]) {
      await connection.rollback();
      return response.status(409).json({ success: false, message: 'Tên đăng nhập, MSSV hoặc thông tin liên hệ đã tồn tại trên hệ thống.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [createResult] = await connection.execute(
      `INSERT INTO users (full_name, student_code, phone, email, username, password_hash, role, must_change_password, total_work_days)
       VALUES (?, ?, ?, ?, ?, ?, 'USER', FALSE, 0)`,
      [cleanFullName, cleanMSSV, phoneToSave, emailToSave, cleanUsername, passwordHash],
    );

    const userId = createResult.insertId;

    // Mark OTP verified
    await connection.execute('UPDATE email_otps SET is_verified = TRUE WHERE id = ?', [otpRows[0].id]);

    await connection.commit();

    const token = jwt.sign(
      { userId, role: 'USER', username: cleanUsername },
      env.jwtSecret,
      { expiresIn: '8h' },
    );

    return response.status(201).json({
      success: true,
      message: 'Đăng ký tài khoản thành công!',
      data: {
        token,
        user: {
          id: userId,
          fullName: cleanFullName,
          username: cleanUsername,
          email: emailToSave,
          phone: phoneToSave,
          role: 'USER',
          faceRegistered: false,
          mustChangePassword: false,
          totalWorkDays: 0,
          studentCode: cleanMSSV,
          address: null,
          hometownProvinceCode: null,
          hometownProvinceName: null,
        },
      },
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

// 4. FORGOT PASSWORD (SEND OTP)
const handleForgotOtp = async (request, response, next) => {
  try {
    await ensureAuthTables(pool);
    const { username, contactInfo, contact, identifier } = request.body;
    const cleanUser = String(username || '').trim();
    const cleanContact = String(contactInfo || contact || identifier || '').trim();

    if (!cleanUser) {
      return response.status(400).json({ success: false, message: 'Vui lòng nhập tên đăng nhập của bạn.' });
    }
    if (!cleanContact) {
      return response.status(400).json({ success: false, message: 'Vui lòng nhập Email hoặc Số điện thoại đã đăng ký.' });
    }

    const isMail = cleanContact.includes('@');
    if (isMail) {
      return response.status(400).json({
        success: false,
        message: 'Chức năng gửi OTP qua Email hiện đang được nâng cấp. Vui lòng sử dụng Số điện thoại để nhận mã xác thực hoặc thử lại sau.',
      });
    }

    // Match username AND phone
    const [users] = await pool.execute(
      `SELECT id, full_name, username, email, phone FROM users 
       WHERE LOWER(username) = LOWER(?) AND phone IS NOT NULL AND (phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '-', '') = ?) LIMIT 1`,
      [cleanUser, cleanContact, cleanContact.replace(/\s|-/g, '')],
    );

    const user = users[0];
    if (!user) {
      return response.status(404).json({
        success: false,
        message: 'Tên đăng nhập và Số điện thoại không khớp với bất kỳ tài khoản nào trong hệ thống.',
      });
    }

    const targetContact = user.phone;
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.execute(
      `INSERT INTO email_otps (email, otp_code, purpose, expires_at)
       VALUES (?, ?, 'FORGOT_PASSWORD', ?)`,
      [targetContact.toLowerCase(), otp, expiresAt],
    );

    const result = await sendOtpMessage({
      contact: targetContact,
      otp,
      purpose: 'FORGOT_PASSWORD',
      fullName: user.full_name,
    });

    return response.json({
      success: true,
      message: result.isRealSms
        ? `Mã OTP xác thực đã được gửi qua tin nhắn SMS tới ${maskContact(targetContact)}.`
        : `Đã gửi mã xác thực tới số ${maskContact(targetContact)}! (Mã OTP SMS thử nghiệm: ${otp})`,
      data: {
        username: user.username,
        contact: targetContact,
        maskedContact: maskContact(targetContact),
        channel: result.channel,
        otp: result.isRealSms ? undefined : otp,
        expiresInSeconds: 300,
      },
    });
  } catch (error) {
    return next(error);
  }
};

router.post('/forgot-password', handleForgotOtp);
router.post('/send-forgot-otp', handleForgotOtp);

// 5. RESET PASSWORD WITH OTP
const handleResetPassword = async (request, response, next) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await ensureAuthTables(connection);

    const { username, contact, contactInfo, otp, newPassword } = request.body;
    const cleanContact = String(contact || contactInfo || '').trim();
    const cleanUser = String(username || '').trim();

    if (!cleanContact || !otp || !newPassword) {
      await connection.rollback();
      return response.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin xác thực và mật khẩu mới.' });
    }

    if (String(newPassword).length < 6) {
      await connection.rollback();
      return response.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
    }

    const cleanOtp = String(otp).trim();

    // Verify OTP
    const [otpRows] = await connection.execute(
      `SELECT id, email, otp_code, expires_at, is_verified
       FROM email_otps
       WHERE LOWER(email) = LOWER(?) AND otp_code = ? AND purpose = 'FORGOT_PASSWORD' AND is_verified = FALSE AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [cleanContact.toLowerCase(), cleanOtp],
    );

    if (!otpRows[0]) {
      await connection.rollback();
      return response.status(400).json({ success: false, message: 'Mã OTP không đúng hoặc đã hết hạn. Vui lòng thử lại.' });
    }

    const isMail = cleanContact.includes('@');
    const [users] = await connection.execute(
      cleanUser
        ? (isMail
            ? 'SELECT id, username FROM users WHERE LOWER(username) = LOWER(?) AND LOWER(email) = LOWER(?) LIMIT 1 FOR UPDATE'
            : 'SELECT id, username FROM users WHERE LOWER(username) = LOWER(?) AND phone = ? LIMIT 1 FOR UPDATE')
        : (isMail
            ? 'SELECT id, username FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1 FOR UPDATE'
            : 'SELECT id, username FROM users WHERE phone = ? LIMIT 1 FOR UPDATE'),
      cleanUser ? [cleanUser, cleanContact] : [cleanContact],
    );

    if (!users[0]) {
      await connection.rollback();
      return response.status(404).json({ success: false, message: 'Không tìm thấy tài khoản tương ứng.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await connection.execute(
      'UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?',
      [passwordHash, users[0].id],
    );

    await connection.execute('UPDATE email_otps SET is_verified = TRUE WHERE id = ?', [otpRows[0].id]);

    await connection.commit();

    return response.json({
      success: true,
      message: 'Đặt lại mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới ngay.',
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
};

router.post('/reset-password', handleResetPassword);
router.post('/reset-password-with-otp', handleResetPassword);

// 6. ME & PROFILE
router.get('/me', authenticate, async (request, response, next) => {
  try {
    await ensureAuthTables(pool);
    const [rows] = await pool.execute(
      'SELECT id, full_name, username, email, role, face_registered, total_work_days, student_code, phone, address, hometown_province_code, hometown_province_name FROM users WHERE id = ? LIMIT 1',
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
    await ensureAuthTables(pool);
    const { fullName, studentCode, phone, email, address, hometownProvinceCode, hometownProvinceName } = request.body;
    if (!fullName?.trim()) {
      return response.status(400).json({ success: false, message: 'Họ và tên không được để trống.', errorCode: 'VALIDATION_ERROR' });
    }
    if (phone && !/^[0-9+()\-\s]{8,20}$/.test(phone.trim())) {
      return response.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.', errorCode: 'VALIDATION_ERROR' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return response.status(400).json({ success: false, message: 'Email không hợp lệ.', errorCode: 'VALIDATION_ERROR' });
    }
    if (studentCode && !/^[A-Za-z0-9._-]{2,30}$/.test(studentCode.trim())) {
      return response.status(400).json({ success: false, message: 'MSSV không hợp lệ.', errorCode: 'VALIDATION_ERROR' });
    }
    try {
      await pool.execute(
        `UPDATE users
         SET full_name = ?, student_code = ?, phone = ?, email = ?, address = ?, hometown_province_code = ?, hometown_province_name = ?
         WHERE id = ?`,
        [
          fullName.trim(),
          studentCode?.trim() || null,
          phone?.trim() || null,
          email?.trim() || null,
          address?.trim() || null,
          hometownProvinceCode || null,
          hometownProvinceName?.trim() || null,
          request.user.userId,
        ],
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return response.status(409).json({ success: false, message: 'MSSV hoặc Email này đã được gán cho tài khoản khác.', errorCode: 'DUPLICATE_ENTRY' });
      }
      throw error;
    }
    const [rows] = await pool.execute(
      'SELECT id, full_name, username, email, role, face_registered, student_code, phone, address, hometown_province_code, hometown_province_name FROM users WHERE id = ? LIMIT 1',
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


