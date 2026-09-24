export const DEFAULT_SHIFTS = [
  { code: 'MORNING', name: 'Ca sáng', start: '07:30:00', end: '12:00:00' },
  { code: 'AFTERNOON', name: 'Ca chiều', start: '13:30:00', end: '17:30:00' },
  { code: 'EVENING', name: 'Ca tối', start: '17:30:00', end: '20:00:00' },
];

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
