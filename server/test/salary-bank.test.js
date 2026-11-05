import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  changedSalaryBankFields,
  decryptAccountNumber,
  encryptAccountNumber,
  maskAccountNumber,
  normalizeSalaryBankInput,
  SalaryBankError,
  sanitizeSpreadsheetText,
} from '../src/utils/salary-bank.js';
import { createSalaryBankWorkbook } from '../src/utils/salary-bank-export.js';

const testKey = '1'.repeat(64);

test('salary bank input is trimmed while preserving account number leading zeroes', () => {
  assert.deepEqual(normalizeSalaryBankInput({
    accountHolderName: '  Nguyễn   Văn A ',
    phone: ' 0912 345 678 ',
    studentCode: ' SV001 ',
    bankName: ' Ngân hàng A ',
    accountNumber: ' 0012 3456 ',
    bankBranch: ' Chi nhánh Hà Nội ',
  }), {
    accountHolderName: 'Nguyễn Văn A',
    phone: '0912 345 678',
    studentCode: 'SV001',
    bankName: 'Ngân hàng A',
    accountNumber: '00123456',
    bankBranch: 'Chi nhánh Hà Nội',
  });
});

test('salary bank input rejects missing required fields and unsafe characters', () => {
  assert.throws(
    () => normalizeSalaryBankInput({ accountNumber: '123;DROP' }),
    (error) => error instanceof SalaryBankError
      && error.code === 'VALIDATION_ERROR'
      && Boolean(error.fields.accountHolderName)
      && Boolean(error.fields.phone)
      && Boolean(error.fields.accountNumber),
  );
});

test('salary bank input rejects malformed phone numbers', () => {
  for (const phone of ['phone-number', '++++++++', '1234567890123456']) {
    assert.throws(
      () => normalizeSalaryBankInput({
        accountHolderName: 'Nguyễn Văn A',
        phone,
        studentCode: 'SV001',
        bankName: 'MB Bank',
        accountNumber: '001234',
        bankBranch: 'Hà Nội',
      }),
      (error) => error instanceof SalaryBankError
        && error.code === 'VALIDATION_ERROR'
        && error.fields.phone === 'Số điện thoại không hợp lệ.',
    );
  }
});

test('salary bank account numbers encrypt and decrypt with the configured key', () => {
  const encrypted = encryptAccountNumber('001234567890', testKey);
  assert.notEqual(encrypted, '001234567890');
  assert.equal(decryptAccountNumber(encrypted, testKey), '001234567890');
  assert.notEqual(encryptAccountNumber('001234567890', testKey), encrypted);
});

test('salary bank encryption rejects missing or invalid keys', () => {
  assert.throws(
    () => encryptAccountNumber('00123', ''),
    (error) => error instanceof SalaryBankError
      && error.code === 'BANK_ENCRYPTION_NOT_CONFIGURED'
      && error.status === 503,
  );
});

test('tampered salary bank ciphertext cannot be decrypted', () => {
  const encrypted = encryptAccountNumber('001234567890', testKey);
  const changed = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(
    () => decryptAccountNumber(changed, testKey),
    (error) => error instanceof SalaryBankError && error.code === 'BANK_DATA_UNREADABLE',
  );
});

test('account numbers are masked except for the last four characters', () => {
  assert.equal(maskAccountNumber('0123456789'), '••••6789');
  assert.equal(maskAccountNumber('123'), '••••');
});

test('spreadsheet text neutralizes formula prefixes and leaves safe numbers unchanged', () => {
  assert.equal(sanitizeSpreadsheetText('=HYPERLINK("https://example.com")'), '\'=HYPERLINK("https://example.com")');
  assert.equal(sanitizeSpreadsheetText('\t@SUM(A1:A2)'), "'\t@SUM(A1:A2)");
  assert.equal(sanitizeSpreadsheetText('001234567890'), '001234567890');
});

test('salary bank audit field list contains only changed field names', () => {
  const previous = { bankName: 'A', accountNumber: '001', bankBranch: 'Hà Nội', phone: '0912345678' };
  const next = { bankName: 'A', accountNumber: '002', bankBranch: 'Hồ Chí Minh', phone: '0900000000' };
  assert.deepEqual(changedSalaryBankFields(previous, next), ['accountNumber', 'bankBranch', 'phone']);
});

test('salary bank export is styled, keeps account numbers as text and neutralizes formulas', async () => {
  const buffer = await createSalaryBankWorkbook([
    {
      full_name: '=2+2',
      phone: '0912345678',
      student_code: 'SV001',
      account_student_code: 'ACCOUNT-CODE-MUST-NOT-BE-USED',
      bank_name: 'MB Bank',
      account_number_encrypted: encryptAccountNumber('001234567890', testKey),
      bank_branch: '+Hà Nội',
      updated_at: '2026-11-04 10:00:00',
      total_work_days: '12.5',
    },
  ], testKey);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Danh sách ngân hàng nhận lương');

  assert.equal(sheet.getCell('B2').value, "'=2+2");
  assert.equal(sheet.getCell('C2').value, 'SV001');
  assert.equal(sheet.getCell('D2').value, '0912345678');
  assert.equal(sheet.getCell('E2').value, 'MB Bank');
  assert.equal(sheet.getCell('F2').value, '001234567890');
  assert.equal(sheet.getCell('F2').numFmt, '@');
  assert.equal(sheet.getCell('G2').value, "'+Hà Nội");
  assert.equal(sheet.getCell('I1').value, 'Ngày cập nhật');
  assert.equal(sheet.getCell('J1').value, 'Tổng công');
  assert.equal(sheet.getCell('J2').value, 12.5);
  assert.equal(sheet.getCell('A1').fill.fgColor.argb, 'FF008080');
  assert.equal(sheet.views[0].ySplit, 1);
  assert.ok(sheet.autoFilter);
});
