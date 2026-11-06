export class ImportedUserIdentityError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'ImportedUserIdentityError';
    this.code = code;
    this.status = status;
  }
}

export function resolveImportedUser(candidates, studentCode, email, fullName = '') {
  const codeMatches = candidates.filter((candidate) => Boolean(candidate.student_code_match));
  const emailMatches = candidates.filter((candidate) => Boolean(candidate.email_match));
  const fullNameMatches = candidates
    .filter((candidate) => Boolean(candidate.full_name_match) && candidate.role === 'USER')
    .sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, { numeric: true }));

  if (fullNameMatches.length) {
    return fullNameMatches.find((candidate) => Boolean(candidate.username_match))
      || fullNameMatches.find((candidate) => Boolean(candidate.student_code_match))
      || fullNameMatches[0];
  }

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
    return null;
  }

  return null;
}
