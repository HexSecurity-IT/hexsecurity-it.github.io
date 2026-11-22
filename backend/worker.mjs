import {sheetReport} from './sheet-report.mjs';
import {mailOutbox} from './mail-outbox.mjs';
import {deliverZohoMail} from './zoho-mail.mjs';
import {expireCustomerReceipts, queueCustomerReceipt} from './customer-receipts.mjs';
import {enquiryReferenceCode} from './enquiry-reference.mjs';

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
  const limit = 6144;
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
  async scheduled(_event, env) {
    await expireCustomerReceipts(env.DB);
    await deliverZohoMail(env);
  },
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/sheet-report') return sheetReport(request,env);
    if (path === '/mail-outbox') return mailOutbox(request,env,readBody);
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
    const enquiry = env.DB.prepare('INSERT INTO enquiries (reference,received_ist,service,customer_name,phone,city) VALUES (?,?,?,?,?,?) ON CONFLICT(reference) DO NOTHING')
      .bind(data.reference,indiaTime.slice(0,19).replace('T',' '),service,name,data.phone,city);
    if (data.delivery === 'website') {
      const email = field(data.email ?? '',254);
      const message = typeof data.message === 'string' ? data.message.trim() : '';
      if ((data.email && !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(email))
        || message.length > 800 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(message)) return reply(400);
      const statements = [enquiry, env.DB.prepare(`INSERT INTO enquiry_mail (reference,reply_to,message)
        SELECT reference,?,? FROM enquiries WHERE reference = ? AND customer_name = ? AND phone = ? AND city = ? AND service = ?
        ON CONFLICT(reference) DO NOTHING`).bind(email,message,data.reference,name,data.phone,city,service)];
      if (email && email.toLowerCase() !== 'info.hexsec@zohomail.in') {
        statements.push(await queueCustomerReceipt(env.DB, data.reference, email));
      }
      const [, queued, receipt] = await env.DB.batch(statements);
      if (ctx && env.ZOHO_MAIL_CONFIG && (queued.meta.changes === 1 || receipt?.meta.changes === 1)) {
        ctx.waitUntil(deliverZohoMail(env, data.reference).catch(() => console.warn('Zoho enquiry queued for retry')));
      }
    } else {
      await enquiry.run();
    }
    return reply(200,{received:true,reference:data.reference,code:enquiryReferenceCode(data.reference)});
  }
};
