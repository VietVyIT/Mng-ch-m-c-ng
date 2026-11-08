import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateAttendanceHistory } from '../src/utils/attendance-history.js';

test('history shows one completed shift when Excel and web attendance overlap', () => {
  const records = [
    {
      id: 1,
      attendance_date: '2026-11-07',
      shift_code: 'EVENING',
      shift_name: 'Ca Tối',
      check_in: '2026-11-07 17:30:00',
      check_out: '2026-11-07 20:00:00',
      status: 'APPROVED',
      source: 'Excel Import',
    },
    {
      id: 2,
      attendance_date: '2026-11-07',
      shift_code: 'EVENING',
      shift_name: 'EVENING',
      check_in: '2026-11-07 17:30:00',
      check_out: '2026-11-07 18:26:00',
      status: 'APPROVED',
      source: 'Camera Request',
    },
  ];

  const result = deduplicateAttendanceHistory(records);
  assert.equal(result.length, 1);
  assert.equal(result[0].shift_code, 'EVENING');
  assert.equal(result[0].check_out, '2026-11-07 18:26:00');
  assert.equal(result[0].source, 'Camera Request');
});

test('history keeps separate shifts on the same day and deduplicates localized shift names', () => {
  const records = [
    { id: 1, attendance_date: '2026-11-07', shift_code: 'MORNING', check_in: '07:30', check_out: '12:00', status: 'APPROVED', source: 'Camera' },
    { id: 2, attendance_date: '2026-11-07', shift_code: 'Ca Sáng', check_in: '07:32', check_out: '11:30', status: 'APPROVED', source: 'Camera Request' },
    { id: 3, attendance_date: '2026-11-07', shift_code: 'AFTERNOON', check_in: '13:30', check_out: '17:30', status: 'APPROVED', source: 'Excel Import' },
  ];

  const result = deduplicateAttendanceHistory(records);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((record) => record.shift_code).sort(), ['AFTERNOON', 'MORNING']);
  assert.equal(result.find((record) => record.shift_code === 'MORNING').source, 'Camera');
});

test('history does not collapse the same shift on different dates', () => {
  const records = [
    { id: 1, attendance_date: '2026-11-06', shift_code: 'MORNING', source: 'Excel Import' },
    { id: 2, attendance_date: '2026-11-07', shift_code: 'MORNING', source: 'Excel Import' },
  ];

  assert.equal(deduplicateAttendanceHistory(records).length, 2);
});
