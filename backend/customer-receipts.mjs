const receiptWindowMs = 10 * 60_000;
const leaseMs = 3 * 60_000;
const receiptLifetimeMs = 24 * 60 * 60_000;
const maxAttempts = 6;

export async function queueCustomerReceipt(db, reference, recipient) {
  const now = Date.now();
  const email = recipient.toLowerCase();
  const key = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email))),
    byte => byte.toString(16).padStart(2, '0')).join('');
  return db.prepare(`INSERT INTO enquiry_receipts (reference, recipient, recipient_key, queued_at)
    SELECT m.reference, ?, ?, ? FROM enquiry_mail m
    WHERE m.reference = ? AND m.reply_to = ? AND m.delivered = 0 AND
      (SELECT COUNT(*) FROM enquiry_receipts WHERE recipient_key = ? AND recipient_key <> '' AND queued_at >= ?) < 3
    ON CONFLICT(reference) DO NOTHING`).bind(recipient, key, now, reference, recipient, key, now - receiptWindowMs);
}

export async function claimCustomerReceipts(db, reference) {
  const lease = crypto.randomUUID();
  const now = Date.now();
  const [, batch] = await db.batch([
    db.prepare(`UPDATE enquiry_receipts SET lease = ?, available_at = ?
      WHERE reference IN (SELECT reference FROM enquiry_receipts
        WHERE status = 'pending' AND available_at <= ? AND queued_at > ? AND (? IS NULL OR reference = ?)
        ORDER BY rowid LIMIT ?)`).bind(lease, now + leaseMs, now, now - receiptLifetimeMs, reference, reference, reference ? 1 : 5),
    db.prepare(`SELECT reference, recipient, attempts FROM enquiry_receipts
      WHERE lease = ? AND status = 'pending' ORDER BY rowid`).bind(lease)
  ]);
  return {lease, rows:batch.results};
}

export async function finishCustomerReceipt(db, row, lease, sent) {
  if (sent) {
    await db.prepare(`UPDATE enquiry_receipts SET status = 'sent', recipient = '', lease = NULL
      WHERE reference = ? AND lease = ? AND status = 'pending'`).bind(row.reference, lease).run();
    return;
  }
  const attempts = row.attempts + 1;
  const exhausted = attempts >= maxAttempts;
  const retryAt = Date.now() + 60_000 * 2 ** attempts;
  await db.prepare(`UPDATE enquiry_receipts SET status = ?, attempts = ?, available_at = ?, lease = NULL,
      recipient = CASE WHEN ? THEN '' ELSE recipient END
    WHERE reference = ? AND lease = ? AND status = 'pending'`)
    .bind(exhausted ? 'failed' : 'pending', attempts, retryAt, exhausted ? 1 : 0, row.reference, lease).run();
}

export async function expireCustomerReceipts(db) {
  const now = Date.now();
  await db.batch([
    db.prepare(`UPDATE enquiry_receipts SET status = 'failed', recipient = '', lease = NULL
      WHERE status = 'pending' AND queued_at <= ? AND available_at <= ?`).bind(now - receiptLifetimeMs, now),
    db.prepare(`UPDATE enquiry_receipts SET recipient_key = ''
      WHERE recipient_key <> '' AND queued_at < ?`).bind(now - receiptWindowMs)
  ]);
}
