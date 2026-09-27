import app from './app.js';
import { env } from './config/env.js';
import { checkDatabaseConnection } from './config/database.js';

async function startServer() {
  try {
    await checkDatabaseConnection();
    app.listen(env.port, '0.0.0.0', () => {
      console.log(`API server đang chạy tại cổng ${env.port} (${env.nodeEnv})`);
    });
  } catch (error) {
    console.error('Không thể khởi động server:', error);
    process.exit(1);
  }
}

startServer();
