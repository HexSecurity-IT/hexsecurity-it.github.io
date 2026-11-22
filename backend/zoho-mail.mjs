import { claimMail, markMailSent } from './mail-outbox.mjs';
import { claimCustomerReceipts, finishCustomerReceipt } from './customer-receipts.mjs';

const inbox = 'info.hexsec@zohomail.in';
const timeoutMs = 15_000;
let cachedToken;

async function getAccessToken(config) {
  if (cachedToken?.credential === config.refresh_token && cachedToken.expires > Date.now() + 120_000) {
    return cachedToken.value;
  }
  const result = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!result.ok) throw new Error(`Zoho Mail authorization returned ${result.status}`);
  const token = await result.json();
  if (typeof token.access_token !== 'string' || !token.access_token) {
    throw new Error('Zoho Mail authorization failed');
  }
  cachedToken = {
    credential: config.refresh_token,
    value: token.access_token,
    expires: Date.now() + Number(token.expires_in || 3600) * 1000
  };
  return token.access_token;
}

function formatEnquiry(row) {
  return [
    'A customer sent an enquiry on the Hex Security website.', '',
    'Service: ' + row.service,
    'Name: ' + row.customer_name,
    'Mobile: +91 ' + row.phone,
    'City: ' + row.city,
    'Email for replies: ' + (row.reply_to || 'Not provided'),
    'Received (IST): ' + row.received_ist, '',
    'Request: ' + (row.message || 'No additional details'), '',
    'Reference: ' + row.reference
  ].join('\n');
}

function formatConfirmation(reference) {
  return [
    'Hello,', '',
    'Thank you for contacting Hex Security. We received your website enquiry. Our team will get in touch soon.', '',
    'Reference: ' + reference, '',
    'If you have more details to share, you can reply to this email.', '',
    'Hex Security Team',
    'Suratgarh, Rajasthan',
    '+91 96806 00369',
    'https://hexsecurity-it.github.io/'
  ].join('\n');
}

async function sendZohoMessage(config, token, toAddress, subject, content) {
  const response = await fetch(`https://mail.zoho.in/api/accounts/${config.account_id}/messages`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Authorization: 'Zoho-oauthtoken ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({fromAddress: inbox, toAddress, subject, content, mailFormat: 'plaintext', encoding: 'UTF-8'}),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    if (response.status === 401) cachedToken = undefined;
    throw new Error(`Zoho Mail did not accept the message (${response.status})`);
  }
  const result = await response.json();
  if (Number(result.status?.code) !== 200 || !result.data?.messageId) {
    throw new Error('Zoho Mail did not confirm the message');
  }
}

async function deliverOwnerNotifications(db, config, token, {lease, rows}) {
  for (const row of rows) {
    await sendZohoMessage(config, token, inbox, 'Website enquiry — ' + row.service, formatEnquiry(row));
    await markMailSent(db, row.reference, lease);
  }
}

async function deliverCustomerConfirmations(db, config, token, {lease, rows}) {
  for (const row of rows) {
    try {
      await sendZohoMessage(config, token, row.recipient, 'We received your Hex Security enquiry', formatConfirmation(row.reference));
    } catch {
      await finishCustomerReceipt(db, row, lease, false);
      continue;
    }
    await finishCustomerReceipt(db, row, lease, true);
  }
}

export async function deliverZohoMail(env, reference = null) {
  if (!env.ZOHO_MAIL_CONFIG) return;
  const config = JSON.parse(env.ZOHO_MAIL_CONFIG);
  if (!/^\d{5,25}$/.test(config.account_id || '')) throw new Error('Invalid Zoho Mail account ID');
  const [owner, customer] = await Promise.all([
    claimMail(env.DB, reference ? 1 : 5, reference),
    claimCustomerReceipts(env.DB, reference)
  ]);
  if (!owner.rows.length && !customer.rows.length) return;
  const token = await getAccessToken(config);
  const results = await Promise.allSettled([
    deliverOwnerNotifications(env.DB, config, token, owner),
    deliverCustomerConfirmations(env.DB, config, token, customer)
  ]);
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
}
