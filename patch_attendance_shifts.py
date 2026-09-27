import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    old_func = '''async function getTodayShift() {
  const [rows] = await pool.execute(
    'SELECT morning_enabled, afternoon_enabled, evening_enabled FROM shift_day_settings WHERE setting_date = CURRENT_DATE LIMIT 1',
  );
  
  const settings = {
    morningEnabled: rows[0]?.morning_enabled !== 0,
    afternoonEnabled: rows[0]?.afternoon_enabled !== 0,
    eveningEnabled: rows[0]?.evening_enabled !== 0,
  };

  const [dbShifts] = await pool.execute('SELECT id as code, name, start_time as start, end_time as end, is_active FROM shifts');
  let baseShifts = dbShifts.length > 0 ? dbShifts : DEFAULT_SHIFTS;

  const enabledShifts = baseShifts.filter((shift) => {
    if (shift.code === 'MORNING' && !settings.morningEnabled) return false;
    if (shift.code === 'AFTERNOON' && !settings.afternoonEnabled) return false;
    if (shift.code === 'EVENING' && !settings.eveningEnabled) return false;
    if (!shift.is_active && shift.is_active !== undefined) return false;
    return true;
  });

  return enabledShifts;
}'''

    new_func = '''async function getTodayShift() {
  try {
    const [dbShifts] = await pool.execute('SELECT id as code, name, start_time as start, end_time as end, is_active FROM shifts WHERE is_active = 1');
    if (dbShifts.length > 0) return dbShifts;
  } catch (e) { }
  return DEFAULT_SHIFTS;
}'''

    new_content = content.replace(old_func, new_func)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")

process_file('d:/Phát đồng phục/management/server/src/routes/attendance.routes.js')
