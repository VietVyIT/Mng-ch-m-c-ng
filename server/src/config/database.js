import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: env.database.host,
  port: env.database.port,
  user: env.database.user,
  password: env.database.password,
  database: env.database.name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+07:00',
  dateStrings: true,
  ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined,
});

export async function checkDatabaseConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.query('SELECT 1');
    console.log("Đã kết nối MySQL thành công. Kiểm tra schema...");

    await connection.query(`
      CREATE TABLE IF NOT EXISTS shifts (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        start_time VARCHAR(10) NOT NULL,
        end_time VARCHAR(10) NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [rows] = await connection.query('SELECT COUNT(*) as count FROM shifts');
    if (rows[0].count === 0) {
      await connection.query(`
        INSERT INTO shifts (id, name, start_time, end_time, is_active) VALUES
        ('MORNING', 'Ca Sáng', '07:30', '12:00', 1),
        ('AFTERNOON', 'Ca Chiều', '13:30', '17:30', 1),
        ('EVENING', 'Ca Tối', '18:00', '20:00', 0)
      `);
      console.log("Đã khởi tạo dữ liệu mẫu cho bảng shifts!");
    }
    try {
      await connection.query('ALTER TABLE attendance MODIFY COLUMN check_in_image LONGTEXT');
      await connection.query('ALTER TABLE attendance MODIFY COLUMN check_out_image LONGTEXT');
      await connection.query('ALTER TABLE attendance_events MODIFY COLUMN image LONGTEXT');
      console.log('Đã cập nhật image columns thành LONGTEXT');
    } catch(e) { }
  } catch (err) {
    console.error("Lỗi khởi tạo schema MySQL:", err.message);
  } finally {
    connection.release();
  }
}
