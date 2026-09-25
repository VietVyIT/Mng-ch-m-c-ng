USE attendance_system;

ALTER TABLE attendance
  ADD COLUMN is_late BOOLEAN NOT NULL DEFAULT FALSE AFTER punctuality_status,
  ADD COLUMN late_minutes INT UNSIGNED NOT NULL DEFAULT 0 AFTER is_late;

UPDATE attendance SET is_late = TRUE WHERE punctuality_status = 'LATE';

ALTER TABLE attendance_events
  ADD COLUMN is_late BOOLEAN NOT NULL DEFAULT FALSE AFTER face_verified,
  ADD COLUMN punctuality_status ENUM('ON_TIME', 'LATE') NOT NULL DEFAULT 'ON_TIME' AFTER is_late;
