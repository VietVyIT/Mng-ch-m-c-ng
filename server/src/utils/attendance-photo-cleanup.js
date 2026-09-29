import { pool } from '../config/database.js';

const PHOTO_RETENTION_HOURS = 20;

export async function cleanupExpiredAttendancePhotos() {
  const [tables] = await pool.execute(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('attendance_events', 'attendance', 'attendance_logs')`,
  );
  const existingTables = new Set(tables.map(({ TABLE_NAME }) => TABLE_NAME));
  const cleanupResults = [];

  if (existingTables.has('attendance_events')) {
    const [result] = await pool.execute(
      `UPDATE attendance_events
       SET image = NULL, photo_expired = TRUE
       WHERE image IS NOT NULL
         AND captured_at < DATE_SUB(NOW(), INTERVAL ${PHOTO_RETENTION_HOURS} HOUR)`,
    );
    cleanupResults.push(result.affectedRows);
  }

  if (existingTables.has('attendance')) {
    const [result] = await pool.execute(
      `UPDATE attendance
       SET photo_expired = TRUE,
           check_in_image = IF(
             check_in_image IS NOT NULL
             AND COALESCE(check_in, created_at) < DATE_SUB(NOW(), INTERVAL ${PHOTO_RETENTION_HOURS} HOUR),
             NULL,
             check_in_image
           ),
           check_out_image = IF(
             check_out_image IS NOT NULL
             AND COALESCE(check_out, created_at) < DATE_SUB(NOW(), INTERVAL ${PHOTO_RETENTION_HOURS} HOUR),
             NULL,
             check_out_image
           )
       WHERE (check_in_image IS NOT NULL
              AND COALESCE(check_in, created_at) < DATE_SUB(NOW(), INTERVAL ${PHOTO_RETENTION_HOURS} HOUR))
          OR (check_out_image IS NOT NULL
              AND COALESCE(check_out, created_at) < DATE_SUB(NOW(), INTERVAL ${PHOTO_RETENTION_HOURS} HOUR))`,
    );
    cleanupResults.push(result.affectedRows);
  }

  if (existingTables.has('attendance_logs')) {
    const [result] = await pool.execute(
      `UPDATE attendance_logs
       SET check_in_image = IF(
             check_in_image IS NOT NULL
             AND COALESCE(
               STR_TO_DATE(REPLACE(LEFT(check_in_time, 19), 'T', ' '), '%Y-%m-%d %H:%i:%s'),
               '1000-01-01 00:00:00'
             ) < DATE_SUB(NOW(), INTERVAL ${PHOTO_RETENTION_HOURS} HOUR),
             NULL,
             check_in_image
           ),
           check_out_image = IF(
             check_out_image IS NOT NULL
             AND COALESCE(
               STR_TO_DATE(REPLACE(LEFT(check_out_time, 19), 'T', ' '), '%Y-%m-%d %H:%i:%s'),
               '1000-01-01 00:00:00'
             ) < DATE_SUB(NOW(), INTERVAL ${PHOTO_RETENTION_HOURS} HOUR),
             NULL,
             check_out_image
           )
       WHERE (check_in_image IS NOT NULL
              AND COALESCE(
                STR_TO_DATE(REPLACE(LEFT(check_in_time, 19), 'T', ' '), '%Y-%m-%d %H:%i:%s'),
                '1000-01-01 00:00:00'
              ) < DATE_SUB(NOW(), INTERVAL ${PHOTO_RETENTION_HOURS} HOUR))
          OR (check_out_image IS NOT NULL
              AND COALESCE(
                STR_TO_DATE(REPLACE(LEFT(check_out_time, 19), 'T', ' '), '%Y-%m-%d %H:%i:%s'),
                '1000-01-01 00:00:00'
              ) < DATE_SUB(NOW(), INTERVAL ${PHOTO_RETENTION_HOURS} HOUR))`,
    );
    cleanupResults.push(result.affectedRows);
  }

  return cleanupResults.reduce((total, affectedRows) => total + affectedRows, 0);
}
