USE attendance_system;

ALTER TABLE users
  ADD COLUMN phone VARCHAR(30) NULL AFTER student_code,
  ADD COLUMN address VARCHAR(255) NULL AFTER phone,
  ADD COLUMN hometown_province_code VARCHAR(20) NULL AFTER address,
  ADD COLUMN hometown_province_name VARCHAR(150) NULL AFTER hometown_province_code;
