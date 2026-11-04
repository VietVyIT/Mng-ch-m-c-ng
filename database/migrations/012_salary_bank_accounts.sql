USE attendance_system;

CREATE TABLE IF NOT EXISTS user_salary_bank_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  account_holder_name VARCHAR(150) NOT NULL,
  student_code VARCHAR(30) NOT NULL,
  bank_name VARCHAR(120) NOT NULL,
  account_number_encrypted TEXT NOT NULL,
  bank_branch VARCHAR(150) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_salary_bank_user_id (user_id),
  CONSTRAINT fk_salary_bank_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_salary_bank_account_audit (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_salary_bank_accounts
  MODIFY COLUMN updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6);

ALTER TABLE user_salary_bank_account_audit
  MODIFY COLUMN changed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);
