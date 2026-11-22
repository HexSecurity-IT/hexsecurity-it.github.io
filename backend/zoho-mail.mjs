import { claimMail, markMailSent } from './mail-outbox.mjs';

const inbox = 'info.hexsec@zohomail.in';
const timeoutMs = 15_000;
let cachedToken;

async function getAccessToken(config) {
  if (cachedToken?.credential === config.refresh_token && cachedToken.expires > Date.now() + 120_000) {
    return cachedToken.value;
  }
  const result = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST',
    redirect: 'error',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const token = await result.json();
  if (!result.ok || typeof token.access_token !== 'string' || !token.access_token) {
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

export async function deliverZohoMail(env, reference = null) {
  if (!env.ZOHO_MAIL_CONFIG) return;
  const config = JSON.parse(env.ZOHO_MAIL_CONFIG);
  if (!/^\d{5,25}$/.test(config.account_id || '')) throw new Error('Invalid Zoho Mail account ID');
  const { lease, rows } = await claimMail(env.DB, reference ? 1 : 5, reference);
  if (!rows.length) return;
  const token = await getAccessToken(config);
  for (const row of rows) {
    const response = await fetch(`https://mail.zoho.in/api/accounts/${config.account_id}/messages`, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: 'Zoho-oauthtoken ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromAddress: inbox,
        toAddress: inbox,
        subject: 'Website enquiry — ' + row.service,
        content: formatEnquiry(row),
        mailFormat: 'plaintext',
        encoding: 'UTF-8'
      }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const sent = await response.json();
    if (!response.ok || sent.status?.code !== 200 || !sent.data?.messageId) {
      if (response.status === 401) cachedToken = undefined;
      throw new Error('Zoho Mail did not accept the enquiry');
    }
    await markMailSent(env.DB, row.reference, lease);
  }
}
