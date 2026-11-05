USE attendance_system;

SET @add_salary_bank_phone = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE user_salary_bank_accounts ADD COLUMN phone VARCHAR(30) NULL AFTER student_code',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_salary_bank_accounts'
    AND COLUMN_NAME = 'phone'
);
PREPARE add_salary_bank_phone_stmt FROM @add_salary_bank_phone;
EXECUTE add_salary_bank_phone_stmt;
DEALLOCATE PREPARE add_salary_bank_phone_stmt;

UPDATE user_salary_bank_accounts b
JOIN users u ON u.id = b.user_id
SET b.phone = u.phone
WHERE b.phone IS NULL AND u.phone IS NOT NULL;
