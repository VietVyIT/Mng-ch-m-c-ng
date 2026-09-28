import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCheckInAt,
  canCheckOutAt,
  getCheckOutWindow,
  getShiftAttendanceState,
} from '../src/utils/attendance-window.js';

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

test('server attendance state respects enabled status and configured shift times', () => {
  const enabled = getShiftAttendanceState(morningStart, morningStart, morningEnd, true, afternoonStart);
  assert.equal(enabled.isCheckInOpen, true);
  assert.equal(enabled.isCheckOutOpen, false);
  assert.equal(enabled.isCheckoutWaiting, true);

  const disabled = getShiftAttendanceState(morningStart, morningStart, morningEnd, false, afternoonStart);
  assert.equal(disabled.isCheckInOpen, false);
  assert.equal(disabled.isCheckOutOpen, false);
  assert.equal(disabled.isCheckoutWaiting, false);
});

test('an enabled shift is not check-in-open before its configured start time', () => {
  const state = getShiftAttendanceState(morningStart - 1, morningStart, morningEnd, true);
  assert.equal(state.isCheckInOpen, false);
});
