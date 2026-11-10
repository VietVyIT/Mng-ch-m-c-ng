import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExcelAttendanceDate } from '../src/utils/excel-attendance-date.js';

test('parses Vietnamese day/month dates without changing August to September', () => {
  assert.equal(parseExcelAttendanceDate('17/08/2026'), '2026-08-17');
  assert.equal(parseExcelAttendanceDate('17/08', 2026), '2026-08-17');
});

test('parses dates with supported separators and ISO format', () => {
  assert.equal(parseExcelAttendanceDate('08.17.2026'), '2026-08-17');
  assert.equal(parseExcelAttendanceDate('2026-11-08'), '2026-11-08');
});

test('uses Vietnamese day/month order for ambiguous dates', () => {
  assert.equal(parseExcelAttendanceDate('08/11/2026'), '2026-11-08');
});

test('rejects invalid calendar dates', () => {
  assert.equal(parseExcelAttendanceDate('31/02/2026'), null);
  assert.equal(parseExcelAttendanceDate('2026-13-01'), null);
});
