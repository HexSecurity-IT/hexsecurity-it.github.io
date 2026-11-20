const pageSize = 200;
const keyPattern = /^[0-9a-f]{64}$/;

function result(status, data) {
  return new Response(data ? JSON.stringify(data) : null, {status, headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'private, no-store',
    'X-Content-Type-Options':'nosniff'
  }});
}

export async function sheetReport(request, env) {
  if (request.method !== 'GET') return result(405);
  const auth = request.headers.get('Authorization') || '';
  if (!keyPattern.test(env.SHEET_KEY_SHA256 || '') || !/^Bearer [0-9a-f]{64}$/.test(auth)) return result(401);
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auth.slice(7)));
  const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,'0')).join('');
  if (actual !== env.SHEET_KEY_SHA256) return result(401);

  const params = new URL(request.url).searchParams;
  const kind = params.get('kind');
  const since = params.get('since');
  const after = Number(params.get('after'));
  if (!['enquiries','visits'].includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(since || '') ||
      !Number.isSafeInteger(after) || after < 0) return result(400);
  const statement = kind === 'enquiries'
    ? 'SELECT rowid, received_ist, customer_name, phone, city, service, reference FROM enquiries WHERE rowid > ? AND received_ist >= ? ORDER BY rowid LIMIT ?'
    : 'SELECT rowid, day_ist, activity, page, total FROM activity WHERE rowid > ? AND day_ist >= ? ORDER BY rowid LIMIT ?';
  const rows = await env.DB.prepare(statement).bind(after,since,pageSize+1).raw();
  const page = rows.slice(0,pageSize);
  return result(200,{
    today:new Date(Date.now() + 330 * 60000).toISOString().slice(0,10),
    rows:page.map(row => row.slice(1)),
    next:rows.length > pageSize ? page[page.length-1][0] : null
  });
}
