USE attendance_system;

ALTER TABLE attendance
  ADD COLUMN punctuality_status ENUM('ON_TIME', 'LATE') NOT NULL DEFAULT 'ON_TIME'
  AFTER status;
