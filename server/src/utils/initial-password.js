export function matchesInitialPassword(password, user) {
  if (!user?.must_change_password) return false;

  if (user.role === 'ADMIN' || user.username === 'admin') {
    return password === 'admin123' || password === process.env.ADMIN_SECRET_KEY;
  }

  const studentCode = user.student_code?.trim();
  const initialPasswords = ['user123'];
  if (studentCode && studentCode !== 'Chưa có MSSV') initialPasswords.push(studentCode);
  return initialPasswords.includes(password);
}
