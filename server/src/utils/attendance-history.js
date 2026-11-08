function normalizeShiftCode(value) {
  const shift = String(value || '').trim().toLocaleUpperCase('vi');
  if (['MORNING', 'CA SÁNG', 'CA SANG'].includes(shift)) return 'MORNING';
  if (['AFTERNOON', 'CA CHIỀU', 'CA CHIEU'].includes(shift)) return 'AFTERNOON';
  if (['EVENING', 'CA TỐI', 'CA TOI'].includes(shift)) return 'EVENING';
  return shift;
}

function historyRecordPriority(record) {
  const complete = Boolean(record.check_in && record.check_out);
  const approved = record.status === 'APPROVED' || record.source === 'Excel Import';
  const sourcePriority = record.source === 'Camera' ? 3
    : record.source === 'Camera Request' ? 2
      : record.source === 'Excel Import' ? 1 : 0;
  return Number(complete && approved) * 100 + sourcePriority * 10 + Number(complete);
}

export function deduplicateAttendanceHistory(records) {
  const grouped = new Map();
  for (const record of records) {
    const date = String(record.attendance_date || '').slice(0, 10);
    const shiftCode = normalizeShiftCode(record.shift_code || record.shift_name);
    const key = `${date}|${shiftCode}`;
    const existing = grouped.get(key);
    if (!existing || historyRecordPriority(record) > historyRecordPriority(existing)) {
      grouped.set(key, { ...record, shift_code: shiftCode });
    }
  }
  return [...grouped.values()]
    .sort((left, right) => (
      String(right.attendance_date).localeCompare(String(left.attendance_date))
      || String(right.check_in || '').localeCompare(String(left.check_in || ''))
    ));
}
