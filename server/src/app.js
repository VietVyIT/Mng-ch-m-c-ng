import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import faceRoutes from './routes/face.routes.js';
import attendanceRoutes from './routes/attendance.routes.js';
import adminRoutes from './routes/admin.routes.js';
import notificationRoutes from './routes/notification.routes.js';

const app = express();

app.use(cors({ origin: env.clientUrl }));
app.use(express.json({ limit: '2mb' }));
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/face', faceRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use(errorMiddleware);

export default app;
