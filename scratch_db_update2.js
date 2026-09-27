import mysql from 'mysql2/promise';

async function migrate() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'Phanvietvy107@',
    database: 'attendance_system'
  });

  try {
    console.log('Creating shifts table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS shifts (
        id VARCHAR(20) PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    console.log('Inserting default shifts...');
    await connection.execute(`
      INSERT IGNORE INTO shifts (id, name, start_time, end_time, is_active) VALUES
      ('MORNING', 'Ca Sáng', '07:30:00', '12:00:00', TRUE),
      ('AFTERNOON', 'Ca Chiều', '13:30:00', '17:30:00', TRUE),
      ('EVENING', 'Ca Tối', '18:00:00', '20:00:00', FALSE);
    `);
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await connection.end();
  }
}

migrate();
