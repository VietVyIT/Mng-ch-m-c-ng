import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ImportedUserIdentityError,
  resolveImportedUser,
} from '../src/utils/imported-user.js';

test('a username collision with a different full name is not treated as an identity match', () => {
  const existingUser = {
    id: 1,
    role: 'USER',
    full_name: 'Nguyễn Văn Khác',
    student_code: 'SV001',
    username: 'Phạm Gia Minh',
    username_match: 1,
    student_code_match: 0,
    email_match: 0,
  };
  assert.equal(resolveImportedUser([existingUser], '', '', 'Phạm Gia Minh'), null);
});

test('conflicting email and student code are rejected instead of updating either account', () => {
  const candidates = [
    { id: 1, student_code: 'SV001', student_code_match: 1, email_match: 0 },
    { id: 2, student_code: 'SV002', student_code_match: 0, email_match: 1 },
  ];

  assert.throws(
    () => resolveImportedUser(candidates, 'SV001', 'other@example.com'),
    (error) => error instanceof ImportedUserIdentityError
      && error.code === 'CONFLICTING_USER_IDENTITY'
      && error.status === 409,
  );
});

test('a username collision on an admin account is never treated as a user match', () => {
  const admin = {
    id: 1,
    role: 'ADMIN',
    username: 'Phạm Gia Minh',
    username_match: 1,
    student_code_match: 0,
    email_match: 0,
  };

  assert.equal(resolveImportedUser([admin], 'SV002', 'minh2@example.com'), null);
});

test('a name-only import updates an existing full-name match without a student code', () => {
  const existingUser = {
    id: 21,
    role: 'USER',
    student_code: null,
    username: 'Phạm Gia Minh',
    full_name_match: 1,
  };

  assert.equal(resolveImportedUser([existingUser], '', ''), existingUser);
});

test('a same-name import reuses the account even when the imported MSSV differs', () => {
  const existingUser = {
    id: 22,
    role: 'USER',
    student_code: 'SV001',
    username: 'Phạm Gia Minh',
    full_name_match: 1,
  };

  assert.equal(resolveImportedUser([existingUser], 'SV002', '', 'Phạm Gia Minh'), existingUser);
});

test('a name-only import updates the unique matching account even when its MSSV is present', () => {
  const existingUser = {
    id: 22,
    role: 'USER',
    student_code: 'SV001',
    username: 'pham-gia-minh',
    full_name_match: 1,
  };

  assert.equal(resolveImportedUser([existingUser], '', '', 'Phạm Gia Minh'), existingUser);
});

test('a same-name import chooses the stable oldest account when duplicate accounts exist', () => {
  const canonicalUser = { id: 22, role: 'USER', student_code: 'SV001', full_name_match: 1 };
  const duplicateUser = { id: 23, role: 'USER', student_code: 'SV002', full_name_match: 1 };

  assert.equal(resolveImportedUser([duplicateUser, canonicalUser], 'SV003', '', 'Phạm Gia Minh'), canonicalUser);
});

test('duplicate same-name accounts prefer the account matching the Excel MSSV', () => {
  const firstUser = { id: 22, role: 'USER', student_code: 'SV001', full_name_match: 1 };
  const matchingUser = { id: 23, role: 'USER', student_code: 'SV002', student_code_match: 1, full_name_match: 1 };

  assert.equal(resolveImportedUser([firstUser, matchingUser], 'SV002', '', 'Phạm Gia Minh'), matchingUser);
});

test('same full name takes precedence over mismatched identifiers on another account', () => {
  const sameNameUser = { id: 22, role: 'USER', student_code: 'SV001', full_name_match: 1 };
  const identifierUser = { id: 23, role: 'USER', student_code: 'SV002', student_code_match: 1 };

  assert.equal(resolveImportedUser([identifierUser, sameNameUser], 'SV002', '', 'Phạm Gia Minh'), sameNameUser);
});

test('users with no stable identifiers can be created as name-only imports', () => {
  assert.equal(resolveImportedUser([], '', '', 'Phạm Gia Minh'), null);
});
