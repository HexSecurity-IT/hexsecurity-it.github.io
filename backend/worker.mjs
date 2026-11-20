const site = 'https://hexsecurity-it.github.io';
const pages = {
  home: 'Home',
  'it-support': 'IT support',
  'wifi-cctv': 'Wi-Fi cameras',
  billing: 'Excel VBA billing software',
  store: 'Websites & online shops',
  marketing: 'SEO, Google & Meta Ads',
  design: 'Graphic design',
  cybersecurity: 'Cybersecurity support'
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(status, body) {
  return new Response(body ? JSON.stringify(body) : null, {status, headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':site,
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Access-Control-Max-Age':'86400',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Vary':'Origin'
  }});
}

async function readBody(request) {
  const limit = 2048;
  if (!request.body || Number(request.headers.get('Content-Length')) > limit) return null;
  const reader = request.body.getReader();
  const bytes = new Uint8Array(limit);
  let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      if (length + value.length > limit) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, length);
      length += value.length;
    }
    const data = JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function field(value, limit) {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  return clean.length <= limit && !/[\u0000-\u001f\u007f]/u.test(clean) ? clean : '';
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!['/activity','/enquiries'].includes(path)) return reply(404);
    if (request.headers.get('Origin') !== site) return reply(403);
    if (request.method === 'OPTIONS') return reply(204);
    if (request.method !== 'POST') return reply(405);
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return reply(415);
    const lead = path === '/enquiries';
    // The limiter uses a transient network key. Neither report table stores it.
    const limiter = lead ? env.LEAD_RATE : env.VIEW_RATE;
    const {success} = await limiter.limit({key:request.headers.get('CF-Connecting-IP') || 'unknown'});
    if (!success) return reply(429);
    const data = await readBody(request);
    if (!data) return reply(400);
    const indiaTime = new Date(Date.now() + 330 * 60000).toISOString();
    if (!lead) {
      const {page, event} = data;
      if (typeof page !== 'string' || !Object.hasOwn(pages, page) || !['view','open'].includes(event) || (event === 'open' && page === 'home')) return reply(400);
      await env.DB.prepare('INSERT INTO activity (day_ist,activity,page,total) VALUES (?,?,?,1) ON CONFLICT(day_ist,activity,page) DO UPDATE SET total=total+1')
        .bind(indiaTime.slice(0,10),event === 'view' ? 'Page view' : 'Service opened',pages[page]).run();
      return reply(204);
    }
    const name = field(data.name,100);
    const city = field(data.city,100);
    if (typeof data.service !== 'string' || typeof data.reference !== 'string' || !uuid.test(data.reference) || !name || !city || typeof data.phone !== 'string'
      || !/^[0-9]{10}$/.test(data.phone) || data.consent !== true || data.service === 'home'
      || !(data.service === 'general' || Object.hasOwn(pages,data.service))) return reply(400);
    const service = data.service === 'general' ? 'General enquiry' : pages[data.service];
    await env.DB.prepare('INSERT INTO enquiries (reference,received_ist,service,customer_name,phone,city) VALUES (?,?,?,?,?,?) ON CONFLICT(reference) DO NOTHING')
      .bind(data.reference,indiaTime.slice(0,19).replace('T',' '),service,name,data.phone,city).run();
    return reply(200,{received:true,reference:data.reference});
  }
};
