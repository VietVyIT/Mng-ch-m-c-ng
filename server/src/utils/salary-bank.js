import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class SalaryBankError extends Error {
  constructor(code, message, status = 400, fields = null) {
    super(message);
    this.name = 'SalaryBankError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function normalizeSalaryBankInput(input) {
  const errors = {};
  const accountHolderName = cleanText(input?.accountHolderName);
  const studentCode = cleanText(input?.studentCode);
  const bankName = cleanText(input?.bankName);
  const accountNumber = typeof input?.accountNumber === 'string'
    ? input.accountNumber.trim().replace(/\s+/g, '')
    : '';
  const bankBranch = cleanText(input?.bankBranch);
  const phone = cleanText(input?.phone);
  const phoneDigits = phone.replace(/\D/g, '');

  if (!accountHolderName) errors.accountHolderName = 'Vui lòng nhập họ và tên chủ tài khoản.';
  else if (accountHolderName.length > 150) errors.accountHolderName = 'Họ và tên không được vượt quá 150 ký tự.';
  if (!phone) errors.phone = 'Vui lòng nhập số điện thoại.';
  else if (
    phone.length > 30
    || !/^[0-9+()\-\s]{8,20}$/.test(phone)
    || phoneDigits.length < 8
    || phoneDigits.length > 15
  ) {
    errors.phone = 'Số điện thoại không hợp lệ.';
  }
  if (!studentCode) errors.studentCode = 'Vui lòng nhập mã số sinh viên nhận lương.';
  else if (studentCode.length > 30) errors.studentCode = 'Mã số sinh viên không được vượt quá 30 ký tự.';
  if (!bankName) errors.bankName = 'Vui lòng chọn hoặc nhập tên ngân hàng.';
  else if (bankName.length > 120) errors.bankName = 'Tên ngân hàng không được vượt quá 120 ký tự.';
  if (!accountNumber) errors.accountNumber = 'Vui lòng nhập số tài khoản.';
  else if (accountNumber.length > 128 || !/^[\p{L}\p{N}.-]+$/u.test(accountNumber)) {
    errors.accountNumber = 'Số tài khoản chứa ký tự không hợp lệ hoặc quá dài.';
  }
  if (!bankBranch) errors.bankBranch = 'Vui lòng nhập chi nhánh ngân hàng.';
  else if (bankBranch.length > 150) errors.bankBranch = 'Chi nhánh không được vượt quá 150 ký tự.';

  if (Object.keys(errors).length) {
    throw new SalaryBankError('VALIDATION_ERROR', 'Vui lòng kiểm tra lại thông tin ngân hàng.', 400, errors);
  }

  return { accountHolderName, phone, studentCode, bankName, accountNumber, bankBranch };
}

function encryptionKey(key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{64}$/i.test(key)) {
    throw new SalaryBankError(
      'BANK_ENCRYPTION_NOT_CONFIGURED',
      'Chức năng ngân hàng chưa được cấu hình khóa mã hóa hợp lệ.',
      503,
    );
  }
  return Buffer.from(key, 'hex');
}

export function encryptAccountNumber(accountNumber, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(accountNumber, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptAccountNumber(encrypted, key) {
  const [version, ivValue, tagValue, ciphertextValue] = String(encrypted || '').split(':');
  if (version !== 'v1' || !ivValue || !tagValue || ciphertextValue === undefined) {
    throw new SalaryBankError('BANK_DATA_UNREADABLE', 'Không thể đọc an toàn thông tin tài khoản ngân hàng.', 500);
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(key), Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (error) {
    if (error instanceof SalaryBankError) throw error;
    throw new SalaryBankError('BANK_DATA_UNREADABLE', 'Không thể đọc an toàn thông tin tài khoản ngân hàng.', 500);
  }
}

export function maskAccountNumber(accountNumber) {
  const value = String(accountNumber || '');
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}

export function sanitizeSpreadsheetText(value) {
  const text = String(value ?? '');
  return /^[\u0000-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
}

export function changedSalaryBankFields(previous, next) {
  if (!previous) return Object.keys(next);
  return Object.keys(next).filter((key) => previous[key] !== next[key]);
}
