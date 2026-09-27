export const DEFAULT_SHIFTS = [
  { code: 'MORNING', name: 'Ca sáng', start: '07:30:00', end: '12:00:00' },
  { code: 'AFTERNOON', name: 'Ca chiều', start: '13:30:00', end: '17:30:00' },
  { code: 'EVENING', name: 'Ca tối', start: '18:00:00', end: '20:00:00' },
];

/**
 * Kiểm tra mốc giờ check-in so với ca làm việc:
 * - Ca Sáng: 07:30 (Sau 07:30 tính là đi trễ)
 * - Ca Chiều: 13:30 (Sau 13:30 tính là đi trễ)
 * - Ca Tối: 18:00 (Sau 18:00 tính là đi trễ)
 */
export function getVietnamMinutes(date = new Date()) {
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
  const [hour, minute] = timeStr.split(':').map(Number);
  return hour * 60 + minute;
}

export function checkLateStatus(shift, now = new Date()) {
  if (!shift || !shift.start) {
    return { isLate: false, punctualityStatus: 'ON_TIME', lateMinutes: 0 };
  }
  const [hour, minute] = shift.start.split(':').map(Number);
  const startMinutes = hour * 60 + minute;
  const currentMinutes = getVietnamMinutes(now);
  const diffMinutes = Math.max(0, currentMinutes - startMinutes);
  const isLate = diffMinutes > 10;
  const lateMinutes = isLate ? diffMinutes : 0;
  return {
    isLate,
    punctualityStatus: isLate ? 'LATE' : 'ON_TIME',
    lateMinutes,
  };
}

export function getCurrentShift(now = new Date(), shiftSettings = { morningEnabled: true, afternoonEnabled: true, eveningEnabled: true }) {
  const minutes = getVietnamMinutes(now);
  const enabledShifts = DEFAULT_SHIFTS.filter((shift) => {
    if (shift.code === 'MORNING' && !shiftSettings.morningEnabled) return false;
    if (shift.code === 'AFTERNOON' && !shiftSettings.afternoonEnabled) return false;
    if (shift.code === 'EVENING' && !shiftSettings.eveningEnabled) return false;
    return true;
  });
  if (enabledShifts.length === 0) return null;
  
  return enabledShifts.find((shift, index) => {
    const [startHour, startMinute] = shift.start.split(':').map(Number);
    const [endHour, endMinute] = shift.end.split(':').map(Number);
    const endMinutes = endHour * 60 + endMinute;
    const isLastShift = index === enabledShifts.length - 1;
    return minutes >= startHour * 60 + startMinute
      && (isLastShift ? minutes <= endMinutes : minutes < endMinutes);
  }) || enabledShifts[0] || null;
}

