import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value && name !== 'DB_PASSWORD') {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${name}`);
  }
  return value || '';
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  clientUrl: required('CLIENT_URL'),
  jwtSecret: required('JWT_SECRET'),
  faceMatchThreshold: Number(process.env.FACE_MATCH_THRESHOLD || 0.6),
  database: {
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    name: required('DB_NAME'),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
  },
};

if (env.nodeEnv === 'production') {
  if (!env.clientUrl.startsWith('https://')) {
    throw new Error('CLIENT_URL production phải dùng HTTPS.');
  }
  if (env.jwtSecret.length < 32 || env.jwtSecret === 'change-this-secret-in-development') {
    throw new Error('JWT_SECRET production phải là chuỗi ngẫu nhiên dài ít nhất 32 ký tự.');
  }
}
