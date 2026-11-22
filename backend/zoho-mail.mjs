import { claimMail, markMailSent } from './mail-outbox.mjs';
import { claimCustomerReceipts, finishCustomerReceipt } from './customer-receipts.mjs';
import { enquiryReferenceCode } from './enquiry-reference.mjs';

const inbox = 'info.hexsec@zohomail.in';
const sender = `Hex Security <${inbox}>`;
const website = 'https://hexsecurity-it.github.io/';
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
    'Enquiry reference: ' + enquiryReferenceCode(row.reference)
  ].join('\n');
}

export function formatConfirmation(reference) {
  const escapedReference = enquiryReferenceCode(reference).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Enquiry received | Hex Security</title>
</head>
<body style="margin:0;background:#f3f1f2;color:#252024;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1f2;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e7dfe2;border-top:4px solid #a61935;border-radius:12px;">
        <tr><td style="padding:24px;background:#fff;border-radius:8px 8px 0 0;border-bottom:1px solid #efe7ea;">
          <table role="presentation" cellspacing="0" cellpadding="0">
            <tr>
              <td valign="middle" style="padding-right:14px;">
                <img src="${website}media/hex-security-mail-logo.gif" width="64" height="64" alt="Hex Security logo" style="display:block;background:#f5f0f1;border:0;border-radius:8px;color:#272027;font-size:11px;">
              </td>
              <td valign="middle" style="color:#201a20;">
                <div style="font-weight:700;font-size:22px;line-height:1.25;">Hex Security</div>
                <div style="margin-top:4px;font-size:13px;line-height:1.4;color:#62565d;">Suratgarh, Rajasthan</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:26px 24px;font-size:16px;line-height:1.55;">
          <h1 style="margin:0 0 14px;color:#201a20;font-size:28px;line-height:1.2;">Enquiry received</h1>
          <p style="margin:0 0 14px;">Hello,</p>
          <p style="margin:0 0 14px;">Thank you for contacting Hex Security. We received your website enquiry and our team will get in touch soon.</p>
          <p style="margin:0 0 20px;">Need to add a detail? Just reply to this email.</p>
          <div style="padding:12px 14px;background:#fbf4f5;border-left:3px solid #a61935;border-radius:4px;">
            <div style="font-size:12px;font-weight:700;color:#8b1932;">Enquiry reference</div>
            <div style="margin-top:3px;font-size:16px;font-weight:700;letter-spacing:.04em;">${escapedReference}</div>
          </div>
        </td></tr>
        <tr><td style="padding:20px 24px 24px;background:#f8f4f5;border-radius:0 0 11px 11px;color:#201a20;font-size:14px;line-height:1.6;">
          <strong style="font-size:16px;">Hex Security Team</strong><br>
          <a href="tel:+919680600369" style="color:#8b1932;">+91 96806 00369</a><br>
          <a href="mailto:${inbox}" style="color:#8b1932;">${inbox}</a>
          <p style="margin:12px 0 0;line-height:1.9;">
            <a href="${website}" style="display:inline-block;margin-right:16px;color:#8b1932;font-weight:700;">Website</a>
            <a href="https://www.linkedin.com/company/hex-sec/" style="display:inline-block;margin-right:16px;color:#8b1932;font-weight:700;">LinkedIn</a>
            <a href="https://wa.me/919680600369" style="display:inline-block;color:#8b1932;font-weight:700;">WhatsApp</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendZohoMessage(config, token, toAddress, subject, content, mailFormat = 'plaintext', fromAddress = inbox) {
  const response = await fetch(`https://mail.zoho.in/api/accounts/${config.account_id}/messages`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Authorization: 'Zoho-oauthtoken ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({fromAddress, toAddress, subject, content, mailFormat, encoding: 'UTF-8'}),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    if (response.status === 401) cachedToken = undefined;
    // Retry with the verified mailbox address only when Zoho rejects the formatted request outright.
    if (fromAddress !== inbox && [400, 422].includes(response.status)) {
      return sendZohoMessage(config, token, toAddress, subject, content, mailFormat);
    }
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
      const subject = 'Hex Security | Enquiry received · ' + enquiryReferenceCode(row.reference);
      await sendZohoMessage(config, token, row.recipient, subject, formatConfirmation(row.reference), 'html', sender);
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
