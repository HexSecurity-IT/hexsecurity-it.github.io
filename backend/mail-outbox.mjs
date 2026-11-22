const keyPattern = /^[0-9a-f]{64}$/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const leaseMs = 180_000;

function response(status, data = null) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}
  });
}

function hasMailKey(request, env) {
  const key = env.ENQUIRY_MAIL_KEY;
  const supplied = request.headers.get('Authorization') || '';
  if (!keyPattern.test(key || '') || !/^Bearer [0-9a-f]{64}$/i.test(supplied)) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= key.charCodeAt(i) ^ supplied.charCodeAt(i + 7);
  return diff === 0;
}

export async function mailOutbox(request, env, readBody) {
  if (!hasMailKey(request, env)) return response(401);
  if (request.method !== 'POST') return response(405);
  const input = await readBody(request);
  if (input?.action === 'ping') return response(200, {ready: true});
  if (input?.action === 'claim') {
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1 || count > 10) return response(400);
    const lease = crypto.randomUUID();
    const now = Date.now();
    const [, batch] = await env.DB.batch([
      env.DB.prepare(`UPDATE enquiry_mail SET lease = ?, lease_until = ?
        WHERE reference IN (SELECT reference FROM enquiry_mail
          WHERE delivered = 0 AND lease_until <= ? ORDER BY rowid LIMIT ?)`).bind(lease, now + leaseMs, now, count),
      env.DB.prepare(`SELECT e.reference, e.received_ist, e.service, e.customer_name, e.phone, e.city,
        m.reply_to, m.message FROM enquiry_mail m JOIN enquiries e ON e.reference = m.reference
        WHERE m.lease = ? AND m.delivered = 0 ORDER BY m.rowid`).bind(lease)
    ]);
    return response(200, {lease, rows: batch.results});
  }
  if (input?.action === 'sent' && uuid.test(input.reference || '') && uuid.test(input.lease || '')) {
    const ack = await env.DB.prepare(`UPDATE enquiry_mail SET delivered = 1, message = '', reply_to = '', lease = NULL
      WHERE reference = ? AND lease = ? AND delivered = 0`).bind(input.reference, input.lease).run();
    return response(200, {acknowledged: ack.meta.changes === 1});
  }
  return response(400);
}
