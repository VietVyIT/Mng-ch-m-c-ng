import { Router } from 'express';
import { pool } from '../config/database.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';

const userRouter = Router();
const adminRouter = Router();
const defaultSettings = {
  title: 'Cập nhật tài khoản ngân hàng',
  message: 'Vui lòng cập nhật thông tin tài khoản ngân hàng và số điện thoại để đảm bảo quá trình nhận lương và các khoản hỗ trợ được thuận tiện, chính xác.',
  buttonLabel: 'Cập nhật ngay',
};

userRouter.use(authenticate, authorize('USER'));
adminRouter.use(authenticate, authorize('ADMIN'));

async function readSettings(response, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT is_enabled, revision, title, message, button_label
       FROM bank_update_notification_settings
       WHERE id = 1 LIMIT 1`,
    );
    if (!rows[0]) {
      return response.status(503).json({
        success: false,
        message: 'Cấu hình thông báo cập nhật ngân hàng chưa được khởi tạo.',
        errorCode: 'SETTING_NOT_INITIALIZED',
      });
    }
    return response.json({
      success: true,
      data: {
        enabled: Boolean(rows[0].is_enabled),
        revision: String(rows[0].revision),
        title: rows[0].title,
        message: rows[0].message,
        buttonLabel: rows[0].button_label,
      },
    });
  } catch (error) {
    return next(error);
  }
}

userRouter.get('/', (request, response, next) => {
  response.set('Cache-Control', 'no-store, max-age=0');
  return readSettings(response, next);
});

adminRouter.get('/', (request, response, next) => {
  response.set('Cache-Control', 'no-store, max-age=0');
  return readSettings(response, next);
});

adminRouter.put('/', async (request, response, next) => {
  const body = request.body || {};
  const hasEnabled = Object.hasOwn(body, 'enabled');
  const hasContent = ['title', 'message', 'buttonLabel'].some((field) => Object.hasOwn(body, field));
  if ((!hasEnabled && !hasContent) || (hasEnabled && typeof body.enabled !== 'boolean')) {
    return response.status(400).json({
      success: false,
      message: 'Nội dung hoặc trạng thái thông báo không hợp lệ.',
      errorCode: 'VALIDATION_ERROR',
    });
  }

  for (const [field, maximum, label] of [
    ['title', 150, 'Tiêu đề'],
    ['message', 2000, 'Nội dung'],
    ['buttonLabel', 60, 'Nhãn nút'],
  ]) {
    if (Object.hasOwn(body, field)
      && (typeof body[field] !== 'string' || !body[field].trim() || body[field].trim().length > maximum)) {
      return response.status(400).json({
        success: false,
        message: `${label} thông báo không hợp lệ (tối đa ${maximum} ký tự).`,
        errorCode: 'VALIDATION_ERROR',
      });
    }
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT is_enabled, title, message, button_label FROM bank_update_notification_settings WHERE id = 1 FOR UPDATE',
    );
    if (!rows[0]) {
      await connection.rollback();
      return response.status(503).json({
        success: false,
        message: 'Cấu hình thông báo cập nhật ngân hàng chưa được khởi tạo.',
        errorCode: 'SETTING_NOT_INITIALIZED',
      });
    }
    const current = rows[0];
    const nextSettings = {
      enabled: hasEnabled ? body.enabled : Boolean(current.is_enabled),
      title: hasContent && Object.hasOwn(body, 'title') ? body.title.trim() : current.title || defaultSettings.title,
      message: hasContent && Object.hasOwn(body, 'message') ? body.message.trim() : current.message || defaultSettings.message,
      buttonLabel: hasContent && Object.hasOwn(body, 'buttonLabel') ? body.buttonLabel.trim() : current.button_label || defaultSettings.buttonLabel,
    };
    const changed = nextSettings.enabled !== Boolean(current.is_enabled)
      || nextSettings.title !== current.title
      || nextSettings.message !== current.message
      || nextSettings.buttonLabel !== current.button_label;
    await connection.execute(
      `UPDATE bank_update_notification_settings
       SET is_enabled = ?, title = ?, message = ?, button_label = ?,
           revision = revision + ?, updated_by = ?,
           updated_at = IF(?, CURRENT_TIMESTAMP(6), updated_at)
       WHERE id = 1`,
      [
        nextSettings.enabled,
        nextSettings.title,
        nextSettings.message,
        nextSettings.buttonLabel,
        changed ? 1 : 0,
        request.user.userId,
        changed,
      ],
    );
    await connection.commit();
    return readSettings(response, next);
  } catch (error) {
    if (connection) await connection.rollback();
    return next(error);
  } finally {
    connection?.release();
  }
});

export { userRouter as bankUpdateNotificationUserRoutes, adminRouter as bankUpdateNotificationAdminRoutes };
