import mysql from 'mysql2/promise';
import { env } from './server/src/config/env.js';

async function test() {
  const pool = mysql.createPool({
    host: env.database.host,
    port: env.database.port,
    user: env.database.user,
    password: env.database.password,
    database: env.database.name,
  });

  const connection = await pool.getConnection();
  try {
    const rawImageData = 'data:image/jpeg;base64,abc';
    
    // Simulate insertion
    const [insert] = await connection.execute(
      \INSERT INTO attendance
       (user_id, attendance_date, shift_code, shift_name, shift_start, shift_end, check_in, check_in_image, status, punctuality_status, is_late, late_minutes, face_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, TRUE)\,
      [2, '2026-09-27', 'EVENING', 'Ca Toi', '18:00', '20:00', '2026-09-27 21:00:00', rawImageData, 'ON_TIME', false, 0],
    );
    console.log("Insert success, id:", insert.insertId);
    
    await connection.execute(
      \INSERT INTO attendance_events
       (attendance_id, user_id, event_type, image, image_mime, face_verified, is_late, punctuality_status, status)
       VALUES (?, ?, ?, ?, 'image/jpeg', TRUE, ?, ?, 'PENDING')\,
      [insert.insertId, 2, 'CHECK_IN', rawImageData, false, 'ON_TIME'],
    );
    console.log("Event insert success");
    
    // Cleanup
    await connection.execute('DELETE FROM attendance_events WHERE attendance_id = ?', [insert.insertId]);
    await connection.execute('DELETE FROM attendance WHERE id = ?', [insert.insertId]);
  } catch (e) {
    console.error("SQL Error:", e);
  } finally {
    connection.release();
    pool.end();
  }
}
test();
