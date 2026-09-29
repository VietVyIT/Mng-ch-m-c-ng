USE attendance_system;

CREATE TABLE IF NOT EXISTS face_re_registration_requests (
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
) ENGINE=InnoDB;
