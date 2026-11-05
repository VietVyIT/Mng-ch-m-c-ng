USE attendance_system;

CREATE TABLE IF NOT EXISTS bank_update_notification_settings (
  id TINYINT UNSIGNED NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  CONSTRAINT fk_bank_update_notification_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO bank_update_notification_settings (id, is_enabled, revision)
VALUES (1, FALSE, 1);
