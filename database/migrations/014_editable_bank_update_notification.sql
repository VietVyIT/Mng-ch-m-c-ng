USE attendance_system;

ALTER TABLE bank_update_notification_settings
  ADD COLUMN title VARCHAR(150) NOT NULL DEFAULT 'Cập nhật tài khoản ngân hàng',
  ADD COLUMN message VARCHAR(2000) NOT NULL DEFAULT 'Vui lòng cập nhật thông tin tài khoản ngân hàng và số điện thoại để đảm bảo quá trình nhận lương và các khoản hỗ trợ được thuận tiện, chính xác.',
  ADD COLUMN button_label VARCHAR(60) NOT NULL DEFAULT 'Cập nhật ngay';
