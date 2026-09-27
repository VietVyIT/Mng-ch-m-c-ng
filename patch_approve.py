import sys

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_fetch = '''
async function approveAllHandler(request, response, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const requestedIds = Array.isArray(request.body?.eventIds)
      ? request.body.eventIds.map(Number).filter(Boolean)
      : null;

    let query = \
      SELECT a.*, u.id AS user_id
      FROM attendance_logs a
      LEFT JOIN users u ON u.student_code = a.mssv OR u.username = a.mssv
      WHERE a.status = 'PENDING'
    \;
    const params = [];
    if (requestedIds && requestedIds.length > 0) {
      query += \ AND a.id IN (\)\;
      params.push(...requestedIds);
    }
    query += ' FOR UPDATE';

    const [events] = await connection.execute(query, params);
    if (!events.length) {
      await connection.rollback();
      return response.json({ success: true, approvedCount: 0, message: 'Không có yêu cầu nào chờ duyệt.' });
    }

    const eventIds = events.map((e) => e.id);
    const eventIdsPlaceholders = eventIds.map(() => '?').join(',');
    await connection.execute(
      \UPDATE attendance_logs SET status = 'APPROVED' WHERE id IN (\)\,
      eventIds,
    );

    for (const evt of events) {
      if (evt.user_id) {
        await connection.execute('UPDATE users SET total_work_days = total_work_days + 1 WHERE id = ?', [evt.user_id]);
        const dateInfo = \\ - Ngày \\;
        await createNotification(connection, {
          recipientId: evt.user_id,
          type: 'ATTENDANCE_APPROVED',
          title: 'Chấm công đã được phê duyệt',
          message: \Yêu cầu chấm công \ của bạn đã được phê duyệt hàng loạt.\,
          dateInfo,
          reason: null,
        });
      }
    }

    await connection.commit();
    return response.json({
      success: true,
      approvedCount: events.length,
      message: \Đã phê duyệt thành công \ yêu cầu chấm công.\,
    });
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
}
'''
    start_idx = content.find('async function approveAllHandler')
    if start_idx != -1:
        end_idx = content.find('router.patch(', start_idx)
        content = content[:start_idx] + new_fetch.strip() + '\n\n' + content[end_idx:]
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")

process_file('d:/Phát đồng phục/management/server/src/routes/admin.routes.js')
