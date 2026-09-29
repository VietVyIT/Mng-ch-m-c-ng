import app from './app.js';
import { env } from './config/env.js';
import { checkDatabaseConnection } from './config/database.js';
import { cleanupExpiredAttendancePhotos } from './utils/attendance-photo-cleanup.js';

async function startServer() {
  try {
    await checkDatabaseConnection();
    await cleanupExpiredAttendancePhotos()
      .then((deletedCount) => console.log(`Đã dọn ${deletedCount} ảnh chấm công quá hạn.`))
      .catch((error) => console.error('Không thể dọn ảnh chấm công quá hạn khi khởi động:', error));
    const photoCleanupInterval = setInterval(() => {
      cleanupExpiredAttendancePhotos()
        .then((deletedCount) => {
          if (deletedCount > 0) console.log(`Đã dọn ${deletedCount} ảnh chấm công quá hạn.`);
        })
        .catch((error) => console.error('Không thể dọn ảnh chấm công quá hạn:', error));
    }, 5 * 60 * 1000);
    photoCleanupInterval.unref();
    app.listen(env.port, '0.0.0.0', () => {
      console.log(`API server đang chạy tại cổng ${env.port} (${env.nodeEnv})`);
    });
  } catch (error) {
    console.error('Không thể khởi động server:', error);
    process.exit(1);
  }
}

startServer();
