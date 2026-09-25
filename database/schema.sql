CREATE DATABASE IF NOT EXISTS attendance_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE attendance_system;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(150) NOT NULL,
  student_code VARCHAR(30) NULL,
  phone VARCHAR(30) NULL,
  address VARCHAR(255) NULL,
  hometown_province_code VARCHAR(20) NULL,
  hometown_province_name VARCHAR(150) NULL,
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
  face_embedding JSON NULL,
  face_registered BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  total_work_days DECIMAL(8,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_student_code (student_code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  attendance_date DATE NOT NULL,
  shift_code VARCHAR(20) NULL,
  shift_name VARCHAR(80) NULL,
  shift_start TIME NULL,
  shift_end TIME NULL,
  check_in DATETIME NULL,
  check_out DATETIME NULL,
  check_in_image MEDIUMBLOB NULL,
  check_out_image MEDIUMBLOB NULL,
  image_mime VARCHAR(50) NULL,
  total_hours DECIMAL(6,2) NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'PRESENT', 'LATE', 'ABSENT', 'INCOMPLETE') NOT NULL DEFAULT 'PENDING',
  punctuality_status ENUM('ON_TIME', 'LATE') NOT NULL DEFAULT 'ON_TIME',
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  late_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  face_verified BOOLEAN NOT NULL DEFAULT FALSE,
  photo_expired BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_user_date (user_id, attendance_date),
  KEY idx_attendance_date (attendance_date),
  CONSTRAINT fk_attendance_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shift_day_settings (
  setting_date DATE NOT NULL,
  evening_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attendance_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('CHECK_IN', 'CHECK_OUT') NOT NULL,
  captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  image MEDIUMBLOB NULL,
  image_mime VARCHAR(50) NULL,
  photo_expired BOOLEAN NOT NULL DEFAULT FALSE,
  face_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  punctuality_status ENUM('ON_TIME', 'LATE') NOT NULL DEFAULT 'ON_TIME',
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_events_status (status),
  KEY idx_events_captured_at (captured_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_deletion_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attendance_id BIGINT UNSIGNED NOT NULL,
  deleted_by BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(500) NULL,
  deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_deletion_attendance (attendance_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS imported_attendance_records (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_id BIGINT UNSIGNED NOT NULL,
  type ENUM('ATTENDANCE_APPROVED', 'ATTENDANCE_REJECTED', 'ATTENDANCE_DELETED', 'SYSTEM_ANNOUNCEMENT') NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  date_info VARCHAR(120) NULL,
  reason VARCHAR(500) NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_recipient (recipient_id, is_read, created_at)
) ENGINE=InnoDB;

-- Tài khoản admin mẫu: username = admin, password = admin123.
-- Đây là bcrypt hash, không lưu mật khẩu dạng plain text.
INSERT INTO users (
  full_name,
  student_code,
  username,
  password_hash,
  role,
  must_change_password
)
SELECT
  'Quản trị viên',
  NULL,
  'admin',
  '$2b$10$HW66dep9uV0JpPZiY.kmf.ckc4KZuInwVuYjdXHGL0mdT4BQuT/3y',
  'ADMIN',
  FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE username = 'admin'
);
