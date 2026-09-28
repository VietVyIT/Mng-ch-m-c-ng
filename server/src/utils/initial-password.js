export function matchesInitialPassword(password, user) {
  if (!user?.must_change_password) return false;

  if (user.role === 'ADMIN' || user.username === 'admin') {
    return password === 'admin123' || password === process.env.ADMIN_SECRET_KEY;
  }

  const initialPasswords = ['user123', 'user123@'];
  if (user.student_code?.trim() && user.student_code !== 'Chưa có MSSV') {
    initialPasswords.push(user.student_code);
  }
  return initialPasswords.includes(password);
}
