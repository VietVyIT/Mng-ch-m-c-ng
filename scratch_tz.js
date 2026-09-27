export function getVietnamMinutes(date = new Date()) {
  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
  console.log('timeStr:', timeStr);
  const [hour, minute] = timeStr.split(':').map(Number);
  return hour * 60 + minute;
}

console.log(getVietnamMinutes(new Date('2026-09-27T03:11:53.000Z')));
