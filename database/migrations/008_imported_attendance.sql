USE attendance_system;

SET @add_total_work_days = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE users ADD COLUMN total_work_days DECIMAL(8,2) NOT NULL DEFAULT 0',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'total_work_days'
);
PREPARE add_total_work_days_stmt FROM @add_total_work_days;
EXECUTE add_total_work_days_stmt;
DEALLOCATE PREPARE add_total_work_days_stmt;

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
