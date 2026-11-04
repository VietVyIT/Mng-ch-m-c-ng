import { createHash } from 'node:crypto';

export class ImportedUserIdentityError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ImportedUserIdentityError';
    this.code = code;
    this.status = status;
  }
}

export function resolveImportedUser(candidates, studentCode, email) {
  const codeMatches = candidates.filter((candidate) => Boolean(candidate.student_code_match));
  const emailMatches = candidates.filter((candidate) => Boolean(candidate.email_match));
  const usernameMatches = candidates.filter((candidate) => Boolean(candidate.username_match));

  if (codeMatches.length > 1 || emailMatches.length > 1) {
    throw new ImportedUserIdentityError(
      'AMBIGUOUS_USER_IDENTITY',
      'Không thể xác định duy nhất tài khoản theo mã sinh viên hoặc email.',
      409,
    );
  }

  const codeMatch = codeMatches[0];
  const emailMatch = emailMatches[0];
  if ([codeMatch, emailMatch].some((match) => match?.role && match.role !== 'USER')) {
    throw new ImportedUserIdentityError(
      'INVALID_USER_ROLE',
      'Thông tin import khớp với tài khoản không phải người dùng; không thể cập nhật tài khoản đó.',
      409,
    );
  }
  if (codeMatch && emailMatch && String(codeMatch.id) !== String(emailMatch.id)) {
    throw new ImportedUserIdentityError(
      'CONFLICTING_USER_IDENTITY',
      'Mã sinh viên và email trong dữ liệu import thuộc về hai tài khoản khác nhau.',
      409,
    );
  }

  if (codeMatch) return codeMatch;
  if (emailMatch) {
    const storedCode = emailMatch.student_code?.trim();
    if (studentCode && storedCode && storedCode.toLowerCase() !== studentCode.toLowerCase()) {
      throw new ImportedUserIdentityError(
        'CONFLICTING_STUDENT_CODE',
        'Email đã thuộc về tài khoản có mã sinh viên khác; không thể tự động ghép tài khoản.',
        409,
      );
    }
    return emailMatch;
  }

  if (!studentCode && !email) {
    const nameOnlyMatches = usernameMatches.filter((candidate) => (
      candidate.role === 'USER' && !candidate.student_code?.trim()
    ));
    if (nameOnlyMatches.length > 1) {
      throw new ImportedUserIdentityError(
        'AMBIGUOUS_USER_IDENTITY',
        'Có nhiều tài khoản trùng tên không có mã sinh viên; không thể xác định duy nhất tài khoản.',
        409,
      );
    }
    return nameOnlyMatches[0] || null;
  }

  return null;
}

export function createImportedUsername(name, studentCode, email, attempt = 0) {
  const identifier = studentCode
    ? `student:${studentCode.trim().toLowerCase()}`
    : email
      ? `email:${email.trim().toLowerCase()}`
      : `name:${name.trim().toLowerCase()}`;
  const hashInput = attempt ? `${identifier}:${attempt}` : identifier;
  const suffix = createHash('sha256').update(hashInput).digest('hex').slice(0, 12);
  const prefix = name.slice(0, 87).trimEnd();
  return `${prefix}-${suffix}`;
}
