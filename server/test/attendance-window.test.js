import test from 'node:test';
import assert from 'node:assert/strict';
import { canCheckInAt, canCheckOutAt, getCheckOutWindow } from '../src/utils/attendance-window.js';

const morningStart = 7 * 60 * 60 + 30 * 60;
const morningEnd = 12 * 60 * 60;
const afternoonStart = 13 * 60 * 60 + 30 * 60;

test('check-in opens at shift start and closes at shift end', () => {
  assert.equal(canCheckInAt(morningStart - 1, morningStart, morningEnd), false);
  assert.equal(canCheckInAt(morningStart, morningStart, morningEnd), true);
  assert.equal(canCheckInAt(morningEnd - 1, morningStart, morningEnd), true);
  assert.equal(canCheckInAt(morningEnd, morningStart, morningEnd), false);
});

test('check-out opens five minutes before shift end and closes when next shift starts', () => {
  const window = getCheckOutWindow(morningStart, morningEnd, afternoonStart);
  assert.equal(window.opensAt, morningEnd - 5 * 60);
  assert.equal(canCheckOutAt(window.opensAt - 1, morningStart, morningEnd, afternoonStart), false);
  assert.equal(canCheckOutAt(window.opensAt, morningStart, morningEnd, afternoonStart), true);
  assert.equal(canCheckOutAt(afternoonStart - 1, morningStart, morningEnd, afternoonStart), true);
  assert.equal(canCheckOutAt(afternoonStart, morningStart, morningEnd, afternoonStart), false);
});

test('check-out window without a following shift ends at midnight', () => {
  const window = getCheckOutWindow(18 * 60 * 60, 20 * 60 * 60);
  assert.equal(window.closesAt, 24 * 60 * 60);
  assert.equal(canCheckOutAt(23 * 60 * 60, 18 * 60 * 60, 20 * 60 * 60), true);
  assert.equal(canCheckOutAt(24 * 60 * 60, 18 * 60 * 60, 20 * 60 * 60), false);
});
