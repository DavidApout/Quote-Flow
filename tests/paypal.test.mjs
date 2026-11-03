import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createPayments, approvalUrl, sandboxTransport } from '../server/paypal.mjs';

function setup(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec('CREATE TABLE quotes(id TEXT PRIMARY KEY); INSERT INTO quotes VALUES (\'quote-1\')');
  let time = 1000000, payload, status = 'CREATED', capture, change = () => {}, pause;
  const calls = [], events = [];
  const transport = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (path === '/v2/checkout/orders') {
      payload = options.body;
      if (pause) await pause;
      return { id: 'ORDER123456', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123456' }] };
    }
    if (path.endsWith('/capture')) {
      status = 'COMPLETED'; capture = { id: 'CAPTURE12345', status: 'COMPLETED', amount: { currency_code: 'USD', value: '60.00' }, final_capture: true };
      return {};
    }
    const order = { ...structuredClone(payload), id: 'ORDER123456', status };
    if (capture) order.purchase_units[0].payments = { captures: [structuredClone(capture)] };
    change(order);
    return order;
  };
  const options = { db, origin: 'http://127.0.0.1:5173', now: () => time, transaction: fn => { db.exec('BEGIN'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } }, quoteEvent: (...args) => events.push(args), config: { businessId: 'owner', merchantId: 'MERCHANT123' }, transport };
  const payment = createPayments(options);
  const quote = { id: 'quote-1', business_id: 'owner', cents: 3000, quantity: 2, status: 'accepted' };
  return { payment, quote, db, options, calls, events, approve: () => { status = 'APPROVED'; }, change: fn => { change = fn; }, advance: ms => { time += ms; }, pending: () => { capture = { status: 'PENDING' }; }, pause: promise => { pause = promise; } };
}

test('sandbox payment uses server totals, persists receipts, and records notifications only once', async t => {
  const s = setup(t);
  assert.equal((await s.payment.act(s.quote, 'create')).state, 'created');
  assert.equal(s.calls[0].body.purchase_units[0].amount.value, '60.00');
  assert.equal(JSON.stringify(s.calls[0].body).includes('customer'), false);
  await assert.rejects(s.payment.act(s.quote, 'capture'), /Approve the payment/);
  assert.equal(s.events.length, 0);
  s.approve(); const result = await s.payment.act(s.quote, 'capture');
  assert.equal(result.state, 'paid'); assert.equal(result.captureId, 'CAPTURE12345');
  assert.equal(s.events.length, 2);
  const restarted = createPayments(s.options);
  assert.equal(restarted.info(s.quote).state, 'paid');
  await restarted.act(s.quote, 'capture');
  assert.equal(s.calls.filter(c => c.path.endsWith('/capture')).length, 1);
  assert.equal(s.events.length, 2);
});

test('sandbox refuses other businesses, unaccepted quotes, unsupported totals, and unsafe redirects', async t => {
  const s = setup(t);
  for (const change of [{ business_id: 'other' }, { status: 'approved' }, { cents: 0 }, { cents: 1000001 }]) await assert.rejects(s.payment.act({ ...s.quote, ...change }, 'create'));
  assert.equal(s.calls.length, 0);
  for (const url of ['https://www.paypal.com/checkoutnow', 'https://www.sandbox.paypal.com.evil.test/checkoutnow', 'javascript:alert(1)', 'https://evil@www.sandbox.paypal.com/checkoutnow', 'https://www.sandbox.paypal.com/other']) assert.throws(() => approvalUrl(url));
});

test('mismatched order, recipient, amount, or capture is never marked paid', async t => {
  const s = setup(t); await s.payment.act(s.quote, 'create'); s.approve();
  for (const change of [o => { o.id = 'WRONG1234'; }, o => { o.purchase_units[0].amount.value = '0.01'; }, o => { o.purchase_units[0].payee.merchant_id = 'OTHER'; }, o => { o.purchase_units[0].custom_id = 'other'; }, o => { o.purchase_units[0].amount.currency_code = 'EUR'; }]) {
    s.change(change); await assert.rejects(s.payment.act(s.quote, 'capture'), /do not match/);
  }
  assert.equal(s.calls.filter(c => c.path.endsWith('/capture')).length, 0);
  s.change(o => { if (o.status === 'COMPLETED') o.purchase_units[0].payments.captures[0].amount.value = '0.01'; });
  await assert.rejects(s.payment.act(s.quote, 'capture'), /did not match/);
  assert.notEqual(s.payment.info(s.quote).state, 'paid'); assert.equal(s.events.length, 0);
  s.change(() => {}); assert.equal((await s.payment.act(s.quote, 'check')).state, 'paid');
});

test('concurrent checkout shares a durable lease; pending capture never triggers another capture', async t => {
  const s = setup(t); let release; s.pause(new Promise(resolve => { release = resolve; }));
  const first = s.payment.act(s.quote, 'create');
  await assert.rejects(createPayments(s.options).act(s.quote, 'create'), /being checked/);
  release(); await first; s.approve(); s.pending();
  assert.equal((await s.payment.act(s.quote, 'capture')).state, 'pending');
  await s.payment.act(s.quote, 'capture');
  assert.equal(s.calls.filter(c => c.path.endsWith('/capture')).length, 0);
  assert.equal(s.events.length, 0);
});

test('lost create responses reuse exact idempotency keys and stop after the retry window', async t => {
  const s = setup(t); const calls = [];
  const options = { ...s.options, transport: async (path, opts) => { calls.push({ path, ...opts }); throw Error('lost response'); } };
  const first = createPayments(options);
  await assert.rejects(first.act(s.quote, 'create'));
  await assert.rejects(createPayments(options).act(s.quote, 'create'));
  assert.equal(calls[0].requestId, calls[1].requestId); assert.deepEqual(calls[0].body, calls[1].body);
  s.advance(3600001);
  await assert.rejects(first.act(s.quote, 'create'), /manual review/); assert.equal(calls.length, 2);
});

test('capture timeout is recovered by order lookup without another capture', async t => {
  const s = setup(t); let lost = true;
  const transport = async (path, opts) => { const result = await s.options.transport(path, opts); if (path.endsWith('/capture') && lost) { lost = false; throw Error('lost response'); } return result; };
  const p = createPayments({ ...s.options, transport }); await p.act(s.quote, 'create'); s.approve();
  await assert.rejects(p.act(s.quote, 'capture'));
  assert.notEqual(p.info(s.quote).state, 'paid');
  assert.equal((await createPayments({ ...s.options, transport }).act(s.quote, 'capture')).state, 'paid');
  assert.equal(s.calls.filter(c => c.path.endsWith('/capture')).length, 1);
});

test('PayPal transport is sandbox-only, authenticates server-side, and never follows redirects', async () => {
  const calls = [];
  const remote = sandboxTransport({ clientId: 'test-client', secret: 'test-secret', fetcher: async (url, opts) => { calls.push({ url, ...opts }); return Response.json(url.endsWith('/token') ? { access_token: 'test-access', expires_in: 3600 } : { id: 'ORDER123456' }); } });
  await remote('/v2/checkout/orders', { method: 'POST', requestId: 'stable-key', body: { intent: 'CAPTURE' } });
  await remote('/v2/checkout/orders/ORDER123456');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.url.startsWith('https://api-m.sandbox.paypal.com/') && c.redirect === 'error'));
  assert.equal(calls[1].headers['PayPal-Request-Id'], 'stable-key');
  assert.equal(calls[1].headers.Authorization, 'Bearer test-access');
});
