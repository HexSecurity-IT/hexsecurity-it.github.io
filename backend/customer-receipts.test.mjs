import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import worker from './worker.mjs';

const inbox = 'info.hexsec@zohomail.in';
const brandedSender = `Hex Security <${inbox}>`;
const site = 'https://hexsecurity-it.github.io';
const config = {
  account_id: '12345678', client_id: 'local-client', client_secret: 'local-secret', refresh_token: 'local-token'
};

function database() {
  const sql = new DatabaseSync(':memory:');
  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  sql.exec(schema.slice(0, schema.indexOf('CREATE TABLE IF NOT EXISTS enquiry_receipts')));
  const migration = readFileSync(new URL('./migrations/0001_enquiry_receipts.sql', import.meta.url), 'utf8');
  sql.exec(migration);
  sql.exec(migration);
  const db = {
    prepare(text) {
      const query = sql.prepare(text);
      return {
        bind(...parameters) {
          return {
            async run() { return {meta: query.run(...parameters)}; },
            result() {
              return query.columns().length ? {results: query.all(...parameters)} : {meta: query.run(...parameters)};
            }
          };
        }
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const result = statements.map(statement => statement.result());
        sql.exec('COMMIT');
        return result;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return {sql, db};
}

function setup(t) {
  const {sql, db} = database();
  t.after(() => sql.close());
  const env = {
    DB: db,
    LEAD_RATE: {limit: async () => ({success: true})},
    ZOHO_MAIL_CONFIG: JSON.stringify(config)
  };
  const intermediary = [];
  const outgoing = [];
  const failures = new Set();
  const rejectedSenders = new Set();
  const accepted = Response.json;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://accounts.zoho.in/oauth/v2/token') {
      return accepted({access_token: 'local-access-token', expires_in: 3600});
    }
    assert.equal(url, 'https://mail.zoho.in/api/accounts/12345678/messages');
    const payload = JSON.parse(options.body);
    outgoing.push(payload);
    if (rejectedSenders.has(payload.fromAddress)) {
      return accepted({status: {code: 400}}, {status: 400});
    }
    return failures.has(payload.toAddress)
      ? accepted({status: {code: 503}}, {status: 503})
      : accepted({status: {code: 200}, data: {messageId: 'local-' + outgoing.length}});
  });
  async function submit(input) {
    const request = new Request('https://worker.example/enquiries', {
      method: 'POST',
      headers: {Origin: site, 'Content-Type': 'application/json'},
      body: JSON.stringify(input)
    });
    const result = await worker.fetch(request, env, {waitUntil: work => intermediary.push(work)});
    await Promise.all(intermediary.splice(0));
    return result;
  }
  return {sql, env, submit, outgoing, failures, rejectedSenders};
}

function lead(overrides = {}) {
  return {
    reference: crypto.randomUUID(), name: 'Demo Customer', city: 'Suratgarh', phone: '9000000000',
    email: 'customer@example.com', message: 'Please call me about the account.', consent: true,
    service: 'cybersecurity', delivery: 'website', ...overrides
  };
}

test('website sends the owner notification and a separate acknowledgement to the customer', async t => {
  const {sql, env, submit, outgoing} = setup(t);
  const input = lead();
  assert.deepEqual(await (await submit(input)).json(), {received: true, reference: input.reference});
  const owner = outgoing.find(mail => mail.toAddress === inbox);
  const customer = outgoing.find(mail => mail.toAddress === input.email);
  assert.equal(outgoing.length, 2);
  assert.match(owner.content, /Demo Customer/);
  assert.match(owner.content, /Please call me/);
  assert.equal(owner.fromAddress, inbox);
  assert.equal(owner.mailFormat, 'plaintext');
  assert.equal(customer.fromAddress, brandedSender);
  assert.equal(customer.mailFormat, 'html');
  assert.equal(customer.subject, 'Hex Security | Enquiry received · ' + input.reference.slice(0, 8).toUpperCase());
  assert.match(customer.content, /We received your website enquiry/);
  assert.match(customer.content, /<strong[^>]*>Hex Security Team<\/strong>/);
  for (const url of [`${site}/media/hex-security-mail-logo.gif`, `${site}/`, 'https://www.linkedin.com/company/hex-sec/', 'https://wa.me/919680600369', 'tel:+919680600369', `mailto:${inbox}`]) {
    assert.ok(customer.content.includes(`="${url}"`));
  }
  assert.ok(customer.content.includes(input.reference));
  assert.ok(!customer.content.includes(input.message));
  assert.ok(!customer.content.includes(input.phone));
  assert.equal(sql.prepare('SELECT recipient FROM enquiry_receipts').get().recipient, '');

  assert.equal((await submit(input)).status, 200);
  await worker.scheduled(null, env);
  assert.equal(outgoing.length, 2);
});

test('keeps the HTML confirmation when Zoho rejects a formatted From address', async t => {
  const {sql, submit, outgoing, rejectedSenders} = setup(t);
  const input = lead();
  rejectedSenders.add(brandedSender);
  assert.equal((await submit(input)).status, 200);
  const customerRequests = outgoing.filter(mail => mail.toAddress === input.email);
  assert.equal(customerRequests.length, 2);
  assert.equal(customerRequests[0].fromAddress, brandedSender);
  assert.deepEqual(customerRequests[1], {...customerRequests[0], fromAddress: inbox});
  assert.equal(sql.prepare('SELECT status FROM enquiry_receipts').get().status, 'sent');
});

test('retries a customer email without resending the owner notification', async t => {
  const {sql, env, submit, outgoing, failures} = setup(t);
  const input = lead();
  failures.add(input.email);
  assert.equal((await submit(input)).status, 200);
  assert.equal(sql.prepare('SELECT delivered FROM enquiry_mail').get().delivered, 1);
  const pending = sql.prepare('SELECT status, recipient, attempts FROM enquiry_receipts').get();
  assert.deepEqual({...pending}, {status: 'pending', recipient: input.email, attempts: 1});
  await worker.scheduled(null, env);
  assert.equal(outgoing.length, 2);

  failures.delete(input.email);
  sql.exec('UPDATE enquiry_receipts SET available_at = 0');
  await worker.scheduled(null, env);
  assert.equal(outgoing.filter(mail => mail.toAddress === inbox).length, 1);
  assert.equal(outgoing.filter(mail => mail.toAddress === input.email).length, 2);
  assert.deepEqual({...sql.prepare('SELECT status, recipient FROM enquiry_receipts').get()}, {status: 'sent', recipient: ''});
});

test('limits repeated acknowledgements and sends owner notices for emails left blank', async t => {
  const {sql, submit, outgoing} = setup(t);
  for (const email of ['Customer@example.com', 'customer@example.com', 'CUSTOMER@example.com', 'customer@example.com', '', inbox]) {
    assert.equal((await submit(lead({email}))).status, 200);
  }
  assert.equal(outgoing.filter(mail => mail.toAddress !== inbox).length, 3);
  assert.equal(outgoing.filter(mail => mail.toAddress === inbox).length, 6);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM enquiry_receipts').get().count, 3);
  const malformed = lead({email: 'customer@example.com,other@example.com'});
  assert.equal((await submit(malformed)).status, 400);
  assert.equal(outgoing.length, 9);
});
