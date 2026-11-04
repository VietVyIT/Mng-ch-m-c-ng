import { Router } from 'express';
import { pool } from '../config/database.js';
import { env } from '../config/env.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { createSalaryBankWorkbook } from '../utils/salary-bank-export.js';
import {
  changedSalaryBankFields,
  decryptAccountNumber,
  encryptAccountNumber,
  maskAccountNumber,
  normalizeSalaryBankInput,
  SalaryBankError,
} from '../utils/salary-bank.js';

const userRouter = Router();
const adminRouter = Router();

userRouter.use(authenticate, authorize('USER'));
adminRouter.use(authenticate, authorize('ADMIN'));

function userBankData(row, includeFullAccount = true) {
  const accountNumber = decryptAccountNumber(row.account_number_encrypted, env.bankAccountEncryptionKey);
  return {
    accountHolderName: row.account_holder_name,
    studentCode: row.student_code,
    bankName: row.bank_name,
    accountNumber: includeFullAccount ? accountNumber : undefined,
    accountNumberMasked: maskAccountNumber(accountNumber),
    bankBranch: row.bank_branch,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sendSalaryBankError(error, response, next) {
  if (!(error instanceof SalaryBankError)) return next(error);
  return response.status(error.status).json({
    success: false,
    message: error.message,
    errorCode: error.code,
    ...(error.fields ? { fields: error.fields } : {}),
  });
}

function filterOptions(query) {
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';
  const bank = typeof query.bank === 'string' ? query.bank.trim().slice(0, 120) : '';
  const status = ['all', 'updated', 'missing'].includes(query.status) ? query.status : 'all';
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const clauses = ["u.role = 'USER'"];
  const params = [];

  if (status === 'updated') clauses.push('b.user_id IS NOT NULL');
  if (status === 'missing') clauses.push('b.user_id IS NULL');
  if (bank) {
    clauses.push('b.bank_name LIKE ?');
    params.push(`%${bank}%`);
  }
  if (search) {
    clauses.push('(u.full_name LIKE ? OR b.student_code LIKE ? OR b.bank_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  return { where: clauses.join(' AND '), params, page, limit };
}

async function getSalaryBankStats(connection) {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN b.user_id IS NOT NULL THEN 1 ELSE 0 END) AS updated
     FROM users u
     LEFT JOIN user_salary_bank_accounts b ON b.user_id = u.id
     WHERE u.role = 'USER'`,
  );
  const total = Number(rows[0]?.total || 0);
  const updated = Number(rows[0]?.updated || 0);
  return { total, updated, missing: total - updated };
}

userRouter.get('/', async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT account_holder_name, student_code, bank_name, account_number_encrypted,
              bank_branch, created_at, updated_at
       FROM user_salary_bank_accounts WHERE user_id = ? LIMIT 1`,
      [request.user.userId],
    );
    return response.json({ success: true, data: rows[0] ? userBankData(rows[0]) : null });
  } catch (error) {
    return sendSalaryBankError(error, response, next);
  }
});

userRouter.put('/', async (request, response, next) => {
  let connection;
  try {
    const input = normalizeSalaryBankInput(request.body);
    const encryptedAccountNumber = encryptAccountNumber(input.accountNumber, env.bankAccountEncryptionKey);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT account_holder_name, student_code, bank_name, account_number_encrypted,
              bank_branch, created_at, updated_at
       FROM user_salary_bank_accounts WHERE user_id = ? FOR UPDATE`,
      [request.user.userId],
    );
    const current = rows[0] || null;

    if (current && !request.body.updatedAt) {
      throw new SalaryBankError(
        'UPDATE_VERSION_REQUIRED',
        'Dữ liệu ngân hàng đã tồn tại; hãy tải lại thông tin trước khi chỉnh sửa.',
        409,
      );
    }
    if (current && String(request.body.updatedAt) !== String(current.updated_at)) {
      throw new SalaryBankError(
        'UPDATE_CONFLICT',
        'Thông tin đã được cập nhật trên thiết bị khác. Hãy tải lại trước khi lưu thay đổi.',
        409,
      );
    }

    const previous = current ? {
      accountHolderName: current.account_holder_name,
      studentCode: current.student_code,
      bankName: current.bank_name,
      accountNumber: decryptAccountNumber(current.account_number_encrypted, env.bankAccountEncryptionKey),
      bankBranch: current.bank_branch,
    } : null;
    const changedFields = changedSalaryBankFields(previous, input);

    if (!current) {
      await connection.execute(
        `INSERT INTO user_salary_bank_accounts
          (user_id, account_holder_name, student_code, bank_name, account_number_encrypted, bank_branch)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          request.user.userId,
          input.accountHolderName,
          input.studentCode,
          input.bankName,
          encryptedAccountNumber,
          input.bankBranch,
        ],
      );
    } else if (changedFields.length) {
      await connection.execute(
        `UPDATE user_salary_bank_accounts
         SET account_holder_name = ?, student_code = ?, bank_name = ?,
             account_number_encrypted = ?, bank_branch = ?
         WHERE user_id = ?`,
        [
          input.accountHolderName,
          input.studentCode,
          input.bankName,
          encryptedAccountNumber,
          input.bankBranch,
          request.user.userId,
        ],
      );
    }

    if (changedFields.length) {
      await connection.execute(
        `INSERT INTO user_salary_bank_account_audit
          (user_id, actor_user_id, action, changed_fields)
         VALUES (?, ?, ?, ?)`,
        [
          request.user.userId,
          request.user.userId,
          current ? 'UPDATE' : 'CREATE',
          JSON.stringify(changedFields),
        ],
      );
    }
    const [savedRows] = await connection.execute(
      `SELECT account_holder_name, student_code, bank_name, account_number_encrypted,
              bank_branch, created_at, updated_at
       FROM user_salary_bank_accounts WHERE user_id = ?`,
      [request.user.userId],
    );
    await connection.commit();
    return response.json({ success: true, data: userBankData(savedRows[0]) });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({
        success: false,
        message: 'Thông tin vừa được lưu từ một yêu cầu khác. Hãy tải lại và thử lại.',
        errorCode: 'UPDATE_CONFLICT',
      });
    }
    return sendSalaryBankError(error, response, next);
  } finally {
    connection?.release();
  }
});

adminRouter.get('/export', async (request, response, next) => {
  let connection;
  try {
    const { where, params } = filterOptions(request.query);
    connection = await pool.getConnection();
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT u.full_name, b.student_code, b.bank_name, b.account_number_encrypted,
              b.bank_branch, b.updated_at
       FROM users u
       LEFT JOIN user_salary_bank_accounts b ON b.user_id = u.id
       WHERE ${where}
       ORDER BY u.full_name, u.id`,
      params,
    );
    const exportedAt = new Date();
    const buffer = await createSalaryBankWorkbook(rows, env.bankAccountEncryptionKey);
    await connection.commit();
    const fileName = `Danh_sach_ngan_hang_nhan_luong_${exportedAt.toISOString().slice(0, 16).replace(/[-T:]/g, '-')}.xlsx`;
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    response.setHeader('X-Exported-At', exportedAt.toISOString());
    return response.send(buffer);
  } catch (error) {
    if (connection) await connection.rollback();
    return sendSalaryBankError(error, response, next);
  } finally {
    connection?.release();
  }
});

adminRouter.get('/', async (request, response, next) => {
  try {
    const { where, params, page, limit } = filterOptions(request.query);
    const offset = (page - 1) * limit;
    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name, b.student_code, b.bank_name, b.account_number_encrypted,
              b.bank_branch, b.updated_at
       FROM users u
       LEFT JOIN user_salary_bank_accounts b ON b.user_id = u.id
       WHERE ${where}
       ORDER BY u.full_name, u.id
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const [[countRow], stats] = await Promise.all([
      pool.execute(
        `SELECT COUNT(*) AS total FROM users u
         LEFT JOIN user_salary_bank_accounts b ON b.user_id = u.id WHERE ${where}`,
        params,
      ),
      getSalaryBankStats(pool),
    ]);
    const data = rows.map((row) => {
      const accountNumber = row.account_number_encrypted
        ? decryptAccountNumber(row.account_number_encrypted, env.bankAccountEncryptionKey)
        : '';
      return {
        id: row.id,
        fullName: row.full_name,
        studentCode: row.student_code,
        bankName: row.bank_name,
        accountNumberMasked: accountNumber ? maskAccountNumber(accountNumber) : null,
        bankBranch: row.bank_branch,
        updatedAt: row.updated_at,
        hasSalaryBank: Boolean(row.updated_at),
      };
    });
    return response.json({
      success: true,
      data,
      stats,
      pagination: { page, limit, total: Number(countRow[0]?.total || 0) },
    });
  } catch (error) {
    return sendSalaryBankError(error, response, next);
  }
});

adminRouter.get('/:userId/account-number', async (request, response, next) => {
  try {
    if (!/^\d+$/.test(request.params.userId)) {
      return response.status(400).json({ success: false, message: 'Mã thành viên không hợp lệ.', errorCode: 'VALIDATION_ERROR' });
    }
    const [rows] = await pool.execute(
      `SELECT account_number_encrypted FROM user_salary_bank_accounts
       WHERE user_id = ? LIMIT 1`,
      [request.params.userId],
    );
    if (!rows.length) {
      return response.status(404).json({ success: false, message: 'Thành viên chưa cập nhật thông tin ngân hàng.', errorCode: 'NOT_FOUND' });
    }
    return response.json({
      success: true,
      data: { accountNumber: decryptAccountNumber(rows[0].account_number_encrypted, env.bankAccountEncryptionKey) },
    });
  } catch (error) {
    return sendSalaryBankError(error, response, next);
  }
});

adminRouter.get('/:userId', async (request, response, next) => {
  try {
    if (!/^\d+$/.test(request.params.userId)) {
      return response.status(400).json({ success: false, message: 'Mã thành viên không hợp lệ.', errorCode: 'VALIDATION_ERROR' });
    }
    const [rows] = await pool.execute(
      `SELECT u.id, u.full_name,
              b.account_holder_name, b.student_code, b.bank_name,
              b.account_number_encrypted, b.bank_branch, b.updated_at
       FROM users u
       LEFT JOIN user_salary_bank_accounts b ON b.user_id = u.id
       WHERE u.id = ? AND u.role = 'USER' LIMIT 1`,
      [request.params.userId],
    );
    if (!rows.length) {
      return response.status(404).json({ success: false, message: 'Không tìm thấy thành viên.', errorCode: 'NOT_FOUND' });
    }
    const row = rows[0];
    const bank = row.account_number_encrypted
      ? userBankData({
        account_holder_name: row.account_holder_name,
        student_code: row.student_code,
        bank_name: row.bank_name,
        account_number_encrypted: row.account_number_encrypted,
        bank_branch: row.bank_branch,
        updated_at: row.updated_at,
      }, false)
      : null;
    return response.json({
      success: true,
      data: {
        id: row.id,
        fullName: row.full_name,
        bank,
      },
    });
  } catch (error) {
    return sendSalaryBankError(error, response, next);
  }
});

export { userRouter as salaryBankUserRoutes, adminRouter as salaryBankAdminRoutes };
