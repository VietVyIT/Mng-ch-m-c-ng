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

  const username = value.trim().replace(/\s+/g, ' ').normalize('NFC');
  if (username === currentUsername) return username;
  if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ._'-]{1,99}$/u.test(username)) {
    throw new ProfileUsernameError('Tên đăng nhập mới phải dài từ 2 đến 100 ký tự; có thể dùng họ tên tiếng Việt có dấu, khoảng trắng, chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.');
  }
  return username;
}
