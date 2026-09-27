import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || env.database.host || 'db',
  port: env.database.port,
  user: process.env.DB_USER || env.database.user || 'root',
  password: process.env.DB_PASSWORD || env.database.password || 'AttendlySecret2026@',
  database: process.env.DB_NAME || env.database.name || 'attendly_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+07:00',
  dateStrings: true,
  ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: false } : undefined,
});

export const initDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    console.log("Connected to MySQL. Migrating schemas...");

    // 1. Tạo bảng shifts
    await connection.query(
      `CREATE TABLE IF NOT EXISTS shifts (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        start_time VARCHAR(10) NOT NULL,
        end_time VARCHAR(10) NOT NULL,
        is_active TINYINT(1) DEFAULT 1,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );

    const [shiftRows] = await connection.query('SELECT COUNT(*) as count FROM shifts');
    if (shiftRows[0].count === 0) {
      await connection.query(
        `INSERT INTO shifts (id, name, start_time, end_time, is_active) VALUES
        ('MORNING', 'Ca Sáng', '07:30', '12:00', 1),
        ('AFTERNOON', 'Ca Chiều', '13:30', '17:30', 1),
        ('EVENING', 'Ca Tối', '18:00', '20:00', 0);`
      );
      console.log("Đã khởi tạo dữ liệu mẫu cho bảng shifts!");
    }

    // 2. Tạo bảng attendance_logs
    await connection.query(
      `CREATE TABLE IF NOT EXISTS attendance_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mssv VARCHAR(50) DEFAULT 'N/A',
        full_name VARCHAR(100) DEFAULT 'Sinh viên',
        shift VARCHAR(20) NOT NULL,
        work_date DATE NOT NULL,
        check_in_time VARCHAR(30) DEFAULT NULL,
        check_out_time VARCHAR(30) DEFAULT NULL,
        check_in_image LONGTEXT,
        check_out_image LONGTEXT,
        status VARCHAR(20) DEFAULT 'PENDING',
        is_late TINYINT(1) DEFAULT 0,
        late_minutes INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );

    // 3. Đảm bảo các cột ảnh luôn là LONGTEXT
    try {
      await connection.query(`ALTER TABLE attendance_logs MODIFY COLUMN check_in_image LONGTEXT;`);
      await connection.query(`ALTER TABLE attendance_logs MODIFY COLUMN check_out_image LONGTEXT;`);
      await connection.query(`ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS is_late TINYINT(1) DEFAULT 0;`);
      await connection.query(`ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS late_minutes INT DEFAULT 0;`);
      await connection.query(`ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS work_date DATE NULL;`);
      
      // Also maintain original tables for backward compatibility until routes are fully refactored
      await connection.query('ALTER TABLE attendance MODIFY COLUMN check_in_image LONGTEXT');
      await connection.query('ALTER TABLE attendance MODIFY COLUMN check_out_image LONGTEXT');
      await connection.query('ALTER TABLE attendance_events MODIFY COLUMN image LONGTEXT');
    } catch (e) {
      console.warn("Alter table notices:", e.message);
    }

    connection.release();
    console.log("Database migration completed.");
  } catch (err) {
    console.error("Database initialization failed:", err);
  }
};

export async function checkDatabaseConnection() {
  await initDatabase();
}

export default pool;
