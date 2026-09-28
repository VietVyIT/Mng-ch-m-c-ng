export function canCheckInAt(currentSeconds, startSeconds, endSeconds) {
  return currentSeconds >= startSeconds && currentSeconds < endSeconds;
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
