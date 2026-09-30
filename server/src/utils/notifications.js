export async function createNotification(connection, {
  recipientId,
  type,
  title,
  message,
  dateInfo = null,
  reason = null,
}) {
  await connection.execute(
    `INSERT INTO notifications
     (recipient_id, type, title, message, date_info, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [recipientId, type, title, message, dateInfo, reason || null],
  );
}

export async function notifyAdministrators(connection, notification) {
  const [admins] = await connection.execute(
    "SELECT id FROM users WHERE role = 'ADMIN'",
  );
  for (const admin of admins) {
    await createNotification(connection, {
      ...notification,
      recipientId: admin.id,
    });
  }
}
