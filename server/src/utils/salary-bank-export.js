import ExcelJS from 'exceljs';
import { decryptAccountNumber, sanitizeSpreadsheetText } from './salary-bank.js';

export async function createSalaryBankWorkbook(rows, encryptionKey) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Danh sách ngân hàng nhận lương', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'STT', key: 'index', width: 7 },
    { header: 'Họ và tên', key: 'fullName', width: 28 },
    { header: 'MSSV', key: 'studentCode', width: 18 },
    { header: 'Ngân hàng', key: 'bankName', width: 24 },
    { header: 'Số tài khoản', key: 'accountNumber', width: 24, style: { numFmt: '@' } },
    { header: 'Chi nhánh', key: 'bankBranch', width: 30 },
    { header: 'Trạng thái', key: 'status', width: 18 },
    { header: 'Ngày cập nhật', key: 'updatedAt', width: 22 },
  ];

  for (const [index, row] of rows.entries()) {
    sheet.addRow({
      index: index + 1,
      fullName: sanitizeSpreadsheetText(row.full_name),
      studentCode: sanitizeSpreadsheetText(row.student_code || ''),
      bankName: sanitizeSpreadsheetText(row.bank_name || ''),
      accountNumber: sanitizeSpreadsheetText(row.account_number_encrypted
        ? decryptAccountNumber(row.account_number_encrypted, encryptionKey)
        : ''),
      bankBranch: sanitizeSpreadsheetText(row.bank_branch || ''),
      status: row.updated_at ? 'Đã cập nhật' : 'Chưa cập nhật',
      updatedAt: row.updated_at ? sanitizeSpreadsheetText(String(row.updated_at)) : '',
    });
  }

  sheet.autoFilter = { from: 'A1', to: 'H1' };
  sheet.getRow(1).height = 25;
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF008080' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.eachRow((row) => row.eachCell((cell) => {
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
  }));
  return workbook.xlsx.writeBuffer();
}
