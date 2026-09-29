export function matchesInitialPassword(password, user) {
  if (!user?.must_change_password) return false;

  if (user.role === 'ADMIN' || user.username === 'admin') {
    return password === 'admin123' || password === process.env.ADMIN_SECRET_KEY;
  }

  const studentCode = user.student_code?.trim();
  const initialPasswords = studentCode && studentCode !== 'Chưa có MSSV'
    ? [studentCode]
    : ['user123'];
  return initialPasswords.includes(password);
}
