import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProfileUsername,
  ProfileUsernameError,
} from '../src/utils/profile-username.js';

test('profile username is trimmed before saving', () => {
  assert.equal(normalizeProfileUsername('  student_01  ', 'old-user'), 'student_01');
});

test('profile username accepts Vietnamese full names with accents and spaces', () => {
  assert.equal(normalizeProfileUsername('  Trần   Nhật Sinh  ', 'old-user'), 'Trần Nhật Sinh');
  assert.equal(normalizeProfileUsername('Nguyễn Thị Ánh', 'old-user'), 'Nguyễn Thị Ánh');
});

test('profile username must use the supported format and length', () => {
  for (const username of ['A', 'user@name', 'x'.repeat(101)]) {
    assert.throws(
      () => normalizeProfileUsername(username, 'old-user'),
      ProfileUsernameError,
    );
  }
});

test('unchanged legacy usernames remain valid while profile details are edited', () => {
  const legacyUsername = 'Sinh viên Nguyễn Văn A';
  assert.equal(normalizeProfileUsername(legacyUsername, legacyUsername), legacyUsername);
});
