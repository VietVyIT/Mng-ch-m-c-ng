export class ProfileUsernameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProfileUsernameError';
  }
}

export function normalizeProfileUsername(value, currentUsername) {
  if (typeof value !== 'string') {
    throw new ProfileUsernameError('Tên đăng nhập phải là dạng văn bản.');
  }

  const username = value.trim();
  if (username === currentUsername) return username;
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) {
    throw new ProfileUsernameError('Tên đăng nhập mới phải dài từ 3 đến 30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  }
  return username;
}
