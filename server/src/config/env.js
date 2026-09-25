import 'dotenv/config';

function required(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  if (!value && name !== 'DB_PASSWORD') {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${name} (hoặc ${fallbackName || ''})`);
  }
  return value || '';
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || '', // Không bắt buộc gắt gao nữa
  jwtSecret: required('JWT_SECRET'),
  faceMatchThreshold: Number(process.env.FACE_MATCH_THRESHOLD || 0.6),
  database: {
    host: required('DB_HOST', 'MYSQLHOST'),
    port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
    name: required('DB_NAME', 'MYSQLDATABASE'),
    user: required('DB_USER', 'MYSQLUSER'),
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  },
};

if (env.nodeEnv === 'production') {
  if (env.clientUrl && !env.clientUrl.startsWith('https://') && !env.clientUrl.startsWith('http://localhost')) {
    console.warn('Cảnh báo: CLIENT_URL production nên dùng HTTPS.');
  }
  if (env.jwtSecret.length < 32 || env.jwtSecret === 'change-this-secret-in-development') {
    throw new Error('JWT_SECRET production phải là chuỗi ngẫu nhiên dài ít nhất 32 ký tự.');
  }
}
