import app from './app.js';
import { env } from './config/env.js';
import { checkDatabaseConnection } from './config/database.js';

async function startServer() {
  try {
    await checkDatabaseConnection();
    app.listen(env.port, () => {
      console.log(API server đang chạy tại cổng \ (\));
    });
  } catch (error) {
    console.error('Không thể khởi động server:', error);
    process.exit(1);
  }
}

startServer();
