import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    old_get = '''router.get('/shifts/:date', async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT setting_date, morning_enabled, afternoon_enabled, evening_enabled FROM shift_day_settings WHERE setting_date = ? LIMIT 1',
      [request.params.date],
    );
    return response.json({
      success: true,
      data: {
        date: request.params.date,
        morningEnabled: rows[0]?.morning_enabled !== 0,
        afternoonEnabled: rows[0]?.afternoon_enabled !== 0,
        eveningEnabled: rows[0]?.evening_enabled !== 0,
        shifts: DEFAULT_SHIFTS
      },
    });
  } catch (error) {
    return next(error);
  }
});'''

    new_get = '''router.get('/shifts/:date', async (request, response, next) => {
  try {
    return response.json({
      success: true,
      data: {
        date: request.params.date,
        morningEnabled: true,
        afternoonEnabled: true,
        eveningEnabled: true,
        shifts: DEFAULT_SHIFTS
      },
    });
  } catch (error) {
    return next(error);
  }
});'''

    old_put = '''router.put('/shifts/:date', async (request, response, next) => {
  try {
    const morningEnabled = request.body.morningEnabled !== undefined ? Boolean(request.body.morningEnabled) : true;
    const afternoonEnabled = request.body.afternoonEnabled !== undefined ? Boolean(request.body.afternoonEnabled) : true;
    const eveningEnabled = request.body.eveningEnabled !== undefined ? Boolean(request.body.eveningEnabled) : true;
    
    await pool.execute(
      INSERT INTO shift_day_settings (setting_date, morning_enabled, afternoon_enabled, evening_enabled, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE morning_enabled = VALUES(morning_enabled), afternoon_enabled = VALUES(afternoon_enabled), evening_enabled = VALUES(evening_enabled), updated_by = VALUES(updated_by),
      [request.params.date, morningEnabled, afternoonEnabled, eveningEnabled, request.user.userId],
    );
    return response.json({ success: true, data: { date: request.params.date, morningEnabled, afternoonEnabled, eveningEnabled } });
  } catch (error) {
    return next(error);
  }
});'''

    new_put = '''router.put('/shifts/:date', async (request, response, next) => {
  try {
    return response.json({ success: true, message: 'Deprecated API' });
  } catch (error) {
    return next(error);
  }
});'''

    new_content = content.replace(old_get, new_get).replace(old_put, new_put)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Success")

process_file('d:/Phát đồng phục/management/server/src/routes/admin.routes.js')
