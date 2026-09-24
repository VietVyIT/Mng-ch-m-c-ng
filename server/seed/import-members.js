import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/database.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(directory, 'members.json');

const members = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
if (!Array.isArray(members) || members.length === 0) throw new Error('members.json phải là một mảng không rỗng.');

const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  for (const member of members) {
    if (!member.id || !member.username || !member.password || member.role !== 'user') {
      throw new Error(`Tài khoản không hợp lệ: ${member.id || member.username || 'unknown'}`);
    }
    const passwordHash = await bcrypt.hash(String(member.password), 12);
    await connection.execute(
      `INSERT INTO users (full_name, username, password_hash, role, phone, must_change_password)
       VALUES (?, ?, ?, 'USER', ?, TRUE)
       ON DUPLICATE KEY UPDATE
         full_name = VALUES(full_name),
         password_hash = VALUES(password_hash),
         role = 'USER',
         phone = VALUES(phone),
         must_change_password = TRUE`,
      [member.username.trim(), member.username.trim(), passwordHash, member.phone || null],
    );
  }
  await connection.commit();
  console.log(`Imported ${members.length} member accounts. Passwords were stored as bcrypt hashes.`);
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
