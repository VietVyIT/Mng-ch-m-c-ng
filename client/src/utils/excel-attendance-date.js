function isValidDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function parseExcelAttendanceDate(value, currentYear = new Date().getFullYear()) {
  const input = String(value ?? '').trim();
  const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, yearText, monthText, dayText] = isoMatch;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    return isValidDate(year, month, day)
      ? `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : null;
  }

  const match = input.match(/^(\d{1,2})[/. -](\d{1,2})(?:[/. -](\d{4}))?$/);
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3] || currentYear);
  const month = first <= 12 && second > 12 ? first : second;
  const day = first <= 12 && second > 12 ? second : first;
  if (!isValidDate(year, month, day)) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
