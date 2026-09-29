import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesInitialPassword } from '../src/utils/initial-password.js';

test('imported user can verify the recorded initial password and documented variants once', () => {
  const importedUser = {
    role: 'USER',
    student_code: 'SV001',
    must_change_password: 1,
  };

  assert.equal(matchesInitialPassword('SV001', importedUser), true);
  assert.equal(matchesInitialPassword('user123', importedUser), true);
  assert.equal(matchesInitialPassword('user123@', importedUser), true);
});

test('initial password fallback is disabled after the first password change', () => {
  const user = {
    role: 'USER',
    student_code: 'SV001',
    must_change_password: 0,
  };

  assert.equal(matchesInitialPassword('SV001', user), false);
  assert.equal(matchesInitialPassword('user123@', user), false);
});

test('user without a student code can use user123 as the import default once', () => {
  const importedUser = {
    role: 'USER',
    username: 'Nguyễn Văn An',
    student_code: null,
    must_change_password: 1,
  };

  assert.equal(matchesInitialPassword('user123', importedUser), true);
  assert.equal(matchesInitialPassword('user123@', importedUser), true);
  assert.equal(matchesInitialPassword('user123', { ...importedUser, must_change_password: 0 }), false);
});

test('admin initial password fallback requires a first-time password change', () => {
  assert.equal(matchesInitialPassword('admin123', { role: 'ADMIN', must_change_password: 1 }), true);
  assert.equal(matchesInitialPassword('admin123', { role: 'ADMIN', must_change_password: 0 }), false);
});
