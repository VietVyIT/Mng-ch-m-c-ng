USE attendance_system;

CREATE TABLE IF NOT EXISTS attendance_deletion_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attendance_id BIGINT UNSIGNED NOT NULL,
  deleted_by BIGINT UNSIGNED NOT NULL,
  reason VARCHAR(500) NULL,
  deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_deletion_attendance (attendance_id),
  CONSTRAINT fk_deletion_user FOREIGN KEY (deleted_by) REFERENCES users(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;
