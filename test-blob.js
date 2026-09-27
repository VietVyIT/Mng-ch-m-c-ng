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

  try {
    const buffer = Buffer.from('hello world');
    // Try to execute the query
    await pool.execute('UPDATE attendance_events SET image = ? WHERE id = -1', [buffer]);
    console.log("Success");
  } catch (e) {
    console.error("Error:", e);
  } finally {
    pool.end();
  }
}
test();
