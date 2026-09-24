USE attendance_system;

ALTER TABLE attendance
  ADD COLUMN check_in_image MEDIUMBLOB NULL AFTER check_out,
  ADD COLUMN check_out_image MEDIUMBLOB NULL AFTER check_in_image,
  ADD COLUMN image_mime VARCHAR(50) NULL AFTER check_out_image;
