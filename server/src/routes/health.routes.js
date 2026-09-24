import { Router } from 'express';
import { checkDatabaseConnection } from '../config/database.js';

const router = Router();

router.get('/', (_request, response) => {
  response.json({
    success: true,
    message: 'Backend is running',
  });
});

router.get('/database', async (_request, response, next) => {
  try {
    await checkDatabaseConnection();
    response.json({
      success: true,
      message: 'Database connection is healthy',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
