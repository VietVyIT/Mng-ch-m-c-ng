import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createImportedUsername,
  ImportedUserIdentityError,
  resolveImportedUser,
} from '../src/utils/imported-user.js';

test('a username collision with a different student code creates a distinct stable username', () => {
  const existingUser = {
    id: 1,
    student_code: 'SV001',
    username: 'Phạm Gia Minh',
    username_match: 1,
    student_code_match: 0,
    email_match: 0,
  };
  const resolved = resolveImportedUser([existingUser], 'SV002', 'minh2@example.com');

  assert.equal(resolved, null);
  const username = createImportedUsername('Phạm Gia Minh', 'SV002', 'minh2@example.com');
  assert.notEqual(username, existingUser.username);
  assert.equal(username, createImportedUsername('Phạm Gia Minh', 'SV002', 'minh2@example.com'));
});

test('different students with the same full name receive distinct usernames', () => {
  const firstUsername = createImportedUsername('Phạm Gia Minh', 'SV001', '');
  const secondUsername = createImportedUsername('Phạm Gia Minh', 'SV002', '');

  assert.notEqual(firstUsername, secondUsername);
  assert.ok(firstUsername.length <= 100);
  assert.ok(secondUsername.length <= 100);
});

test('a collided-name account resolves to the same user on repeated imports', () => {
  const username = createImportedUsername('Phạm Gia Minh', 'SV002', 'minh2@example.com');
  const existingUser = {
    id: 42,
    student_code: 'SV002',
    username,
    student_code_match: 1,
    email_match: 0,
  };

  assert.equal(resolveImportedUser([existingUser], 'SV002', 'minh2@example.com'), existingUser);
  assert.equal(resolveImportedUser([existingUser], 'SV002', 'minh2@example.com'), existingUser);
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

test('a name-only import updates an existing username account without a student code', () => {
  const existingUser = {
    id: 21,
    role: 'USER',
    student_code: null,
    username: 'Phạm Gia Minh',
    username_match: 1,
  };

  assert.equal(resolveImportedUser([existingUser], '', ''), existingUser);
});

test('a name-only import does not update an account with a different stored student code', () => {
  const existingUser = {
    id: 22,
    role: 'USER',
    student_code: 'SV001',
    username: 'Phạm Gia Minh',
    username_match: 1,
  };

  assert.equal(resolveImportedUser([existingUser], '', ''), null);
});

test('a name-only account gets a deterministic username when that name belongs to another account', () => {
  const existingStudent = {
    id: 23,
    role: 'USER',
    student_code: 'SV001',
    username: 'Phạm Gia Minh',
    username_match: 1,
  };
  const nameOnlyUsername = createImportedUsername('Phạm Gia Minh', '', '');
  const resolved = resolveImportedUser([existingStudent], '', '');
  const nameOnlyUser = {
    id: 24,
    role: 'USER',
    student_code: null,
    username: nameOnlyUsername,
    username_match: 1,
  };

  assert.equal(resolved, null);
  assert.notEqual(nameOnlyUsername, existingStudent.username);
  assert.equal(nameOnlyUsername, createImportedUsername('Phạm Gia Minh', '', ''));
  assert.equal(resolveImportedUser([existingStudent, nameOnlyUser], '', ''), nameOnlyUser);
});

test('a username collision on an admin account is not treated as a name-only user match', () => {
  const admin = {
    id: 1,
    role: 'ADMIN',
    student_code: null,
    username: 'Phạm Gia Minh',
    username_match: 1,
  };

  assert.equal(resolveImportedUser([admin], '', ''), null);
});

test('new name-only accounts use a stable username', () => {
  const firstUsername = createImportedUsername('Phạm Gia Minh', '', '');
  const secondUsername = createImportedUsername('Phạm Gia Minh', '', '');

  assert.equal(firstUsername, secondUsername);
  assert.ok(firstUsername.length <= 100);
});

test('users with no stable identifiers can be created as name-only imports', () => {
  assert.equal(resolveImportedUser([], '', ''), null);
});

test('multiple name-only accounts with the same username are rejected', () => {
  assert.throws(
    () => resolveImportedUser([
      { id: 1, role: 'USER', student_code: null, username_match: 1 },
      { id: 2, role: 'USER', student_code: null, username_match: 1 },
    ], '', ''),
    (error) => error instanceof ImportedUserIdentityError
      && error.code === 'AMBIGUOUS_USER_IDENTITY',
  );
});
