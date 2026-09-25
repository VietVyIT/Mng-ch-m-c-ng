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
export function checkLateStatus(shift, now = new Date()) {
  if (!shift || !shift.start) {
    return { isLate: false, punctualityStatus: 'ON_TIME', lateMinutes: 0 };
  }
  const [hour, minute] = shift.start.split(':').map(Number);
  const startMinutes = hour * 60 + minute;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isLate = currentMinutes > startMinutes;
  const lateMinutes = Math.max(0, currentMinutes - startMinutes);
  return {
    isLate,
    punctualityStatus: isLate ? 'LATE' : 'ON_TIME',
    lateMinutes,
  };
}

export function getCurrentShift(now = new Date(), eveningEnabled = true) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const enabledShifts = DEFAULT_SHIFTS.filter((shift) => shift.code !== 'EVENING' || eveningEnabled);
  return enabledShifts.find((shift, index) => {
    if (shift.code === 'EVENING' && !eveningEnabled) return false;
    const [startHour, startMinute] = shift.start.split(':').map(Number);
    const [endHour, endMinute] = shift.end.split(':').map(Number);
    const endMinutes = endHour * 60 + endMinute;
    const isLastShift = index === enabledShifts.length - 1;
    return minutes >= startHour * 60 + startMinute
      && (isLastShift ? minutes <= endMinutes : minutes < endMinutes);
  }) || enabledShifts[0] || null;
}

