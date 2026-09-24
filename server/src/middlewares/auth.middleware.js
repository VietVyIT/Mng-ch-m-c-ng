import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function authenticate(request, response, next) {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : null;

  if (!token) {
    return response.status(401).json({
      success: false,
      message: 'Bạn cần đăng nhập để tiếp tục.',
      errorCode: 'AUTH_REQUIRED',
    });
  }

  try {
    request.user = jwt.verify(token, env.jwtSecret);
    return next();
  } catch {
    return response.status(401).json({
      success: false,
      message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
      errorCode: 'INVALID_TOKEN',
    });
  }
}

export function authorize(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.user.role)) {
      return response.status(403).json({
        success: false,
        message: 'Bạn không có quyền truy cập chức năng này.',
        errorCode: 'FORBIDDEN',
      });
    }
    return next();
  };
}
