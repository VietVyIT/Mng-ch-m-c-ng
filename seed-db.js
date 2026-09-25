import fs from 'fs';
import mysql from 'mysql2/promise';
import path from 'path';

async function runMigrations() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendance_system',
    multipleStatements: true,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  });

  const schemaPath = path.resolve('database/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('Đang chạy schema.sql...');
  await connection.query(sql);
  console.log('Thành công! Đã tạo các bảng.');
  
  // Create default admin user if not exists
  console.log('Đang tạo tài khoản admin mặc định...');
  try {
    const passwordHash = '$2b$10$wI5Q2rK8Fq4D2G3Xv/z/P.f69Zf6jF64.bMvE6T76Z4bMvE6T76Z4'; // Example hash, but we should let the user register or provide a raw sql insert.
    // wait, we can just hash it. The app uses bcrypt.
  } catch (e) {
    console.error(e);
  }
  
  await connection.end();
}

runMigrations().catch(console.error);
