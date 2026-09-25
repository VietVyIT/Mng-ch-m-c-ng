import app from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.log(`API server đang chạy tại cổng ${env.port} (${env.nodeEnv})`);
});
