import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || env.database.host || 'db',
  port: env.database.port,
  user: process.env.DB_USER || env.database.user || 'root',
  password: process.env.DB_PASSWORD || env.database.password || 'AttendlySecret2026@',
  database: process.env.DB_NAME || env.database.name || 'attendly_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+07:00',
  dateStrings: true,
  ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined,
});

export const initDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    console.log("Connected to MySQL. Migrating schemas...");

    // 1. Tạo bảng shifts
    await connection.query(
      `CREATE TABLE IF NOT EXISTS shifts (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        start_time VARCHAR(10) NOT NULL,
        end_time VARCHAR(10) NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );

    const [shiftRows] = await connection.query('SELECT COUNT(*) as count FROM shifts');
    if (shiftRows[0].count === 0) {
      await connection.query(
        `INSERT INTO shifts (id, name, start_time, end_time, is_active) VALUES
        ('MORNING', 'Ca Sáng', '07:30', '12:00', 1),
        ('AFTERNOON', 'Ca Chiều', '13:30', '17:30', 1),
        ('EVENING', 'Ca Tối', '18:00', '20:00', 0);`
      );
      console.log("Đã khởi tạo dữ liệu mẫu cho bảng shifts!");
    }

    await connection.query(
      `CREATE TABLE IF NOT EXISTS face_re_registration_requests (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        new_face_embedding JSON NOT NULL,
        new_face_image LONGTEXT NULL,
        status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        rejection_reason VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME NULL,
        reviewed_by BIGINT UNSIGNED NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_face_re_registration_requests_user
          FOREIGN KEY (user_id) REFERENCES users (id)
          ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_face_re_registration_requests_reviewer
          FOREIGN KEY (reviewed_by) REFERENCES users (id)
          ON UPDATE CASCADE ON DELETE SET NULL,
        KEY idx_face_re_registration_requests_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        recipient_id BIGINT UNSIGNED NOT NULL,
        type ENUM(
          'ATTENDANCE_APPROVED',
          'ATTENDANCE_REJECTED',
          'ATTENDANCE_DELETED',
          'SYSTEM_ANNOUNCEMENT',
          'ATTENDANCE_REQUEST',
          'FACE_REGISTRATION_REQUEST'
        ) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        date_info VARCHAR(120) NULL,
        reason VARCHAR(500) NULL,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_notifications_recipient (recipient_id, is_read, created_at),
        CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_id) REFERENCES users(id)
          ON UPDATE CASCADE ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
    await connection.query(
      `ALTER TABLE notifications MODIFY COLUMN type ENUM(
        'ATTENDANCE_APPROVED',
        'ATTENDANCE_REJECTED',
        'ATTENDANCE_DELETED',
        'SYSTEM_ANNOUNCEMENT',
        'ATTENDANCE_REQUEST',
        'FACE_REGISTRATION_REQUEST'
      ) NOT NULL`
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS user_salary_bank_accounts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        account_holder_name VARCHAR(150) NOT NULL,
        student_code VARCHAR(30) NOT NULL,
        phone VARCHAR(30) NULL,
        bank_name VARCHAR(120) NOT NULL,
        account_number_encrypted TEXT NOT NULL,
        bank_branch VARCHAR(150) NOT NULL,
        created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_salary_bank_user_id (user_id),
        CONSTRAINT fk_salary_bank_user FOREIGN KEY (user_id) REFERENCES users (id)
          ON UPDATE CASCADE ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
    const [salaryBankColumns] = await connection.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'user_salary_bank_accounts'`,
    );
    const salaryBankColumnNames = new Set(salaryBankColumns.map((column) => column.COLUMN_NAME));
    if (!salaryBankColumnNames.has('phone')) {
      await connection.query(
        'ALTER TABLE user_salary_bank_accounts ADD COLUMN phone VARCHAR(30) NULL AFTER student_code',
      );
    }
    await connection.query(
      `UPDATE user_salary_bank_accounts b
       JOIN users u ON u.id = b.user_id
       SET b.phone = u.phone
       WHERE b.phone IS NULL AND u.phone IS NOT NULL`,
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS user_salary_bank_account_audit (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        actor_user_id BIGINT UNSIGNED NULL,
        action ENUM('CREATE', 'UPDATE') NOT NULL,
        changed_fields JSON NOT NULL,
        changed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_salary_bank_audit_user_time (user_id, changed_at),
        CONSTRAINT fk_salary_bank_audit_user FOREIGN KEY (user_id) REFERENCES users (id)
          ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_salary_bank_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users (id)
          ON UPDATE CASCADE ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
    await connection.query(
      `CREATE TABLE IF NOT EXISTS bank_update_notification_settings (
        id TINYINT UNSIGNED NOT NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
        title VARCHAR(150) NOT NULL DEFAULT 'Cập nhật tài khoản ngân hàng',
        message VARCHAR(2000) NOT NULL DEFAULT 'Vui lòng cập nhật thông tin tài khoản ngân hàng và số điện thoại để đảm bảo quá trình nhận lương và các khoản hỗ trợ được thuận tiện, chính xác.',
        button_label VARCHAR(60) NOT NULL DEFAULT 'Cập nhật ngay',
        updated_by BIGINT UNSIGNED NULL,
        updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        CONSTRAINT fk_bank_update_notification_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
          ON UPDATE CASCADE ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
    const [notificationSettingColumns] = await connection.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'bank_update_notification_settings'`,
    );
    const existingNotificationSettingColumns = new Set(
      notificationSettingColumns.map((column) => column.COLUMN_NAME),
    );
    for (const [column, definition] of [
      ['title', "VARCHAR(150) NOT NULL DEFAULT 'Cập nhật tài khoản ngân hàng'"],
      ['message', "VARCHAR(2000) NOT NULL DEFAULT 'Vui lòng cập nhật thông tin tài khoản ngân hàng và số điện thoại để đảm bảo quá trình nhận lương và các khoản hỗ trợ được thuận tiện, chính xác.'"],
      ['button_label', "VARCHAR(60) NOT NULL DEFAULT 'Cập nhật ngay'"],
    ]) {
      if (!existingNotificationSettingColumns.has(column)) {
        await connection.query(
          `ALTER TABLE bank_update_notification_settings ADD COLUMN ${column} ${definition}`,
        );
      }
    }
    await connection.query(
      `INSERT IGNORE INTO bank_update_notification_settings (id, is_enabled, revision)
       VALUES (1, FALSE, 1)`,
    );
    const [salaryBankTimestampColumns] = await connection.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATETIME_PRECISION
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND ((TABLE_NAME = 'user_salary_bank_accounts' AND COLUMN_NAME = 'updated_at')
           OR (TABLE_NAME = 'user_salary_bank_account_audit' AND COLUMN_NAME = 'changed_at'))`,
    );
    for (const column of salaryBankTimestampColumns) {
      if (Number(column.DATETIME_PRECISION) >= 6) continue;
      if (column.TABLE_NAME === 'user_salary_bank_accounts') {
        await connection.query(
          'ALTER TABLE user_salary_bank_accounts MODIFY COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)',
        );
      } else {
        await connection.query(
          'ALTER TABLE user_salary_bank_account_audit MODIFY COLUMN changed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)',
        );
      }
    }

    // 2. Tạo bảng attendance_logs
    await connection.query(
      `CREATE TABLE IF NOT EXISTS attendance_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mssv VARCHAR(50) DEFAULT 'N/A',
        full_name VARCHAR(100) DEFAULT 'Sinh viên',
        shift VARCHAR(20) NOT NULL,
        work_date DATE NOT NULL,
        check_in_time VARCHAR(30) DEFAULT NULL,
        check_out_time VARCHAR(30) DEFAULT NULL,
        check_in_image LONGTEXT,
        check_out_image LONGTEXT,
        status VARCHAR(20) DEFAULT 'PENDING',
        is_late TINYINT(1) DEFAULT 0,
        late_minutes INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );

    // 3. Đảm bảo các cột ảnh luôn là LONGTEXT
    try {
      await connection.query(`ALTER TABLE attendance_logs MODIFY COLUMN check_in_image LONGTEXT;`);
      await connection.query(`ALTER TABLE attendance_logs MODIFY COLUMN check_out_image LONGTEXT;`);
      for (const [column, definition] of [
        ['is_late', 'TINYINT(1) DEFAULT 0'],
        ['late_minutes', 'INT DEFAULT 0'],
        ['work_date', 'DATE NULL'],
      ]) {
        const [columns] = await connection.query(
          'SHOW COLUMNS FROM attendance_logs LIKE ?',
          [column],
        );
        if (columns.length === 0) {
          await connection.query(
            `ALTER TABLE attendance_logs ADD COLUMN ${column} ${definition};`,
          );
        }
      }
      
      // Also maintain original tables for backward compatibility until routes are fully refactored
      await connection.query('ALTER TABLE attendance MODIFY COLUMN check_in_image LONGTEXT');
      await connection.query('ALTER TABLE attendance MODIFY COLUMN check_out_image LONGTEXT');
      await connection.query('ALTER TABLE attendance_events MODIFY COLUMN image LONGTEXT');
    } catch (e) {
      console.warn("Alter table notices:", e.message);
    }

    await connection.query(
      `UPDATE users
       SET password_hash = ?, must_change_password = TRUE
       WHERE username = 'admin'
         AND role = 'ADMIN'
         AND password_hash = ?
         AND must_change_password = FALSE`,
      [
        '$2b$10$7AZG/p6hwpkEkwnU/6wVROpWdHEyJ/m9t2BzI1KB3y5EPoOzOwzce',
        '$2b$10$HW66dep9uV0JpPZiY.kmf.ckc4KZuInwVuYjdXHGL0mdT4BQuT/3y',
      ],
    );

    connection.release();
    console.log("Database migration completed.");
  } catch (err) {
    console.error("Database initialization failed:", err);
  }
};

export async function checkDatabaseConnection() {
  await initDatabase();
}

export default pool;
