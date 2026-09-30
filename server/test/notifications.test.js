import test from 'node:test';
import assert from 'node:assert/strict';
import { notifyAdministrators } from '../src/utils/notifications.js';

test('approval request notifications are created for every administrator', async () => {
  const calls = [];
  const connection = {
    async execute(query, parameters) {
      calls.push({ query, parameters });
      if (query.startsWith('SELECT id FROM users')) return [[{ id: 2 }, { id: 5 }]];
      return [{ affectedRows: 1 }];
    },
  };

  await notifyAdministrators(connection, {
    type: 'ATTENDANCE_REQUEST',
    title: 'Yêu cầu check-in mới',
    message: 'User gửi yêu cầu check-in.',
  });

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.slice(1).map((call) => call.parameters), [
    [2, 'ATTENDANCE_REQUEST', 'Yêu cầu check-in mới', 'User gửi yêu cầu check-in.', null, null],
    [5, 'ATTENDANCE_REQUEST', 'Yêu cầu check-in mới', 'User gửi yêu cầu check-in.', null, null],
  ]);
});

test('approval notifications are skipped when no administrators exist', async () => {
  const calls = [];
  const connection = {
    async execute(query, parameters) {
      calls.push({ query, parameters });
      return [[]];
    },
  };

  await notifyAdministrators(connection, {
    type: 'FACE_REGISTRATION_REQUEST',
    title: 'Yêu cầu đăng ký lại khuôn mặt',
    message: 'User gửi yêu cầu cập nhật khuôn mặt.',
  });

  assert.equal(calls.length, 1);
});
