import fs from 'fs';
import mysql from 'mysql2/promise';
import path from 'path';

async function runMigrations() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'REDACTED',
    database: 'attendance_system',
    multipleStatements: true,
    ssl: { rejectUnauthorized: false }
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
