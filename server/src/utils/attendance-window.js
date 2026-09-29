export function canCheckInAt(currentSeconds, startSeconds, endSeconds) {
  return currentSeconds >= startSeconds && currentSeconds <= startSeconds + 2 * 60 * 60;
}

export function getCheckOutWindow(startSeconds, endSeconds, nextShiftStartSeconds = 24 * 60 * 60) {
  return {
    opensAt: Math.max(startSeconds, endSeconds - 5 * 60),
    closesAt: nextShiftStartSeconds,
  };
}

export function canCheckOutAt(currentSeconds, startSeconds, endSeconds, nextShiftStartSeconds) {
  const { opensAt, closesAt } = getCheckOutWindow(startSeconds, endSeconds, nextShiftStartSeconds);
  return currentSeconds >= opensAt && currentSeconds < closesAt;
}

export function getShiftAttendanceState(
  currentSeconds,
  startSeconds,
  endSeconds,
  isActive,
  nextShiftStartSeconds = 24 * 60 * 60,
) {
  const isCheckInOpen = isActive && canCheckInAt(currentSeconds, startSeconds, endSeconds);
  const checkoutOpensAt = Math.max(startSeconds, endSeconds - 5 * 60);
  return {
    isCheckInOpen,
    isCheckOutOpen: isActive && canCheckOutAt(
      currentSeconds,
      startSeconds,
      endSeconds,
      nextShiftStartSeconds,
    ),
    isCheckoutWaiting: isActive && currentSeconds >= startSeconds && currentSeconds < checkoutOpensAt,
  };
}
