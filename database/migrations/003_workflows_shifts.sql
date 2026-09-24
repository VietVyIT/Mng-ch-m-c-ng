USE attendance_system;

ALTER TABLE attendance
  MODIFY status ENUM('PENDING', 'APPROVED', 'REJECTED', 'PRESENT', 'LATE', 'ABSENT', 'INCOMPLETE')
  NOT NULL DEFAULT 'PENDING',
  ADD COLUMN shift_code VARCHAR(20) NULL AFTER attendance_date,
  ADD COLUMN shift_name VARCHAR(80) NULL AFTER shift_code,
  ADD COLUMN shift_start TIME NULL AFTER shift_name,
  ADD COLUMN shift_end TIME NULL AFTER shift_start,
  ADD COLUMN photo_expired BOOLEAN NOT NULL DEFAULT FALSE AFTER face_verified;

CREATE TABLE IF NOT EXISTS shift_day_settings (
  setting_date DATE NOT NULL,
  evening_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_date),
  CONSTRAINT fk_shift_setting_user FOREIGN KEY (updated_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
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
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_events_status (status),
  KEY idx_events_captured_at (captured_at),
  CONSTRAINT fk_event_attendance FOREIGN KEY (attendance_id) REFERENCES attendance(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_event_user FOREIGN KEY (user_id) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_event_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;
