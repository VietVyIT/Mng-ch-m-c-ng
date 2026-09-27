import mysql from 'mysql2/promise';

async function run() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Phanvietvy107@',
    database: 'attendance_system'
  });
  
  await connection.query(`
    CREATE TABLE IF NOT EXISTS shifts (
      id VARCHAR(20) PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  
  await connection.query(`
    INSERT INTO shifts (id, name, start_time, end_time, is_active) VALUES
    ('MORNING', 'Ca Sáng', '07:30:00', '12:00:00', TRUE),
    ('AFTERNOON', 'Ca Chiều', '13:30:00', '17:30:00', TRUE),
    ('EVENING', 'Ca Tối', '18:00:00', '20:00:00', FALSE)
    ON DUPLICATE KEY UPDATE name=VALUES(name)
  `);
  
  console.log('Shifts table created and seeded successfully.');
  await connection.end();
}
run().catch(console.error);
