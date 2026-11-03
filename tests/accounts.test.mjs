import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../server/app.mjs';

const origin = 'http://127.0.0.1:5173';
const password = 'a long test passphrase 123';
async function start(options = {}) {
  const api = await createApi({ origin, ...options });
  const server = createServer(api.handle);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = 'GET', body, cookie = '', headers = {} } = {}) => {
    const res = await fetch(base + '/api' + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-QuoteFlow-Request': '1', Cookie: cookie, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0], cookieHeader: res.headers.get('set-cookie') };
  };
  return { request, flushMail: api.flushMail, frameAncestors: api.frameAncestors, stop: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); api.close(); } };
}
async function register(request, email, role = 'customer') {
  const result = await request('/auth/register', { method: 'POST', body: { email, password, role, name: email.split('@')[0], businessName: 'Test studio' } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result;
}

test('accounts enforce ownership, server pricing, quote stages, logout, and recovery', async t => {
  const app = await start(); t.after(app.stop);
  const { request } = app;
  const owner = await register(request, 'owner@example.test', 'business');
  const otherOwner = await register(request, 'other-owner@example.test', 'business');
  const customer = await register(request, 'customer@example.test');
  const stranger = await register(request, 'stranger@example.test');
  assert.match(owner.cookieHeader, /HttpOnly/); assert.match(owner.cookieHeader, /SameSite=Lax/);
  assert.equal((await request('/workspace')).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'customer@example.test', password: 'wrong' } })).status, 401);
  assert.equal((await request('/auth/register', { method: 'POST', body: { email: 'x@example.test', password, name: 'X', role: 'admin' } })).status, 400);
  assert.equal((await request('/services', { method: 'POST', cookie: customer.cookie, body: { name: 'Bad', price: 25 } })).status, 403);
  const service = await request('/services', { method: 'POST', cookie: owner.cookie, body: { name: 'Shirt', price: 25 } });
  assert.equal(service.status, 201);
  assert.equal((await request(`/services/${service.body.id}`, { method: 'DELETE', cookie: otherOwner.cookie })).status, 404);
  assert.equal((await request('/services', { method: 'POST', cookie: owner.cookie, headers: { Origin: 'https://evil.example' }, body: { name: 'Bad', price: 2 } })).status, 403);
  assert.equal((await request('/services', { method: 'POST', cookie: owner.cookie, headers: { 'X-QuoteFlow-Request': '' }, body: { name: 'Bad', price: 2 } })).status, 403);
  assert.equal((await request('/services', { method: 'POST', cookie: owner.cookie, headers: { 'X-QuoteFlow-User': customer.body.user.id }, body: { name: 'Bad', price: 2 } })).status, 401);
  const quote = await request('/quotes', { method: 'POST', cookie: customer.cookie, body: { businessId: owner.body.user.id, serviceId: service.body.id, request: 'Blue', quantity: 2, price: 0.01, total: 0.02, status: 'approved', customerId: stranger.body.user.id } });
  assert.equal(quote.status, 201);
  let workspace = await request('/workspace', { cookie: customer.cookie });
  assert.equal(workspace.body.quotes[0].total, 50); assert.equal(workspace.body.quotes[0].status, 'pending');
  assert.equal((await request('/workspace', { cookie: stranger.cookie })).body.quotes.length, 0);
  assert.equal((await request('/workspace', { cookie: otherOwner.cookie })).body.quotes.length, 0);
  assert.equal((await request(`/quotes/${quote.body.id}`, { method: 'PATCH', cookie: customer.cookie, body: { status: 'accepted' } })).status, 409);
  assert.equal((await request(`/quotes/${quote.body.id}`, { method: 'PATCH', cookie: otherOwner.cookie, body: { status: 'approved', price: 1 } })).status, 404);
  assert.equal((await request(`/quotes/${quote.body.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'approved', price: 30 } })).status, 200);
  assert.equal((await request(`/quotes/${quote.body.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'approved', price: 1 } })).status, 409);
  assert.equal((await request(`/quotes/${quote.body.id}`, { method: 'PATCH', cookie: stranger.cookie, body: { status: 'accepted' } })).status, 404);
  assert.equal((await request(`/quotes/${quote.body.id}`, { method: 'PATCH', cookie: customer.cookie, body: { status: 'accepted', price: 1 } })).status, 200);
  workspace = await request('/workspace', { cookie: customer.cookie });
  assert.equal(workspace.body.quotes[0].total, 60); assert.equal(workspace.body.quotes[0].status, 'accepted');
  const custom = await request('/quotes', { method: 'POST', cookie: customer.cookie, body: { businessId: owner.body.user.id, serviceId: 'custom', request: 'Embroidery', quantity: 3 } });
  assert.equal(custom.status, 201);
  assert.equal((await request('/workspace', { cookie: customer.cookie })).body.quotes[1].total, null);
  assert.equal((await request('/quotes', { method: 'POST', cookie: customer.cookie, body: { businessId: owner.body.user.id, serviceId: 'custom', request: ' ', quantity: 3 } })).status, 400);
  assert.equal((await request(`/quotes/${custom.body.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'rejected' } })).status, 200);
  await request('/auth/logout', { method: 'POST', cookie: owner.cookie });
  assert.equal((await request('/auth/session', { cookie: owner.cookie })).body.user, null);
  const nextPassword = 'my replacement passphrase 456';
  const reset = await request('/auth/recover', { method: 'POST', body: { email: 'customer@example.test', recoveryCode: customer.body.recoveryCode, password: nextPassword } });
  assert.equal(reset.status, 200); assert.ok(reset.body.recoveryCode);
  assert.equal((await request('/workspace', { cookie: customer.cookie })).status, 401);
  assert.equal((await request('/auth/recover', { method: 'POST', body: { email: 'customer@example.test', recoveryCode: customer.body.recoveryCode, password } })).status, 400);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'customer@example.test', password } })).status, 401);
  assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'CUSTOMER@example.test', password: nextPassword } })).status, 200);
});

test('persistent database uses password hashes and sessions expire', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'quoteflow-auth-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const database = join(dir, 'test.sqlite'); let time = Date.now();
  let app = await start({ database, now: () => time });
  const user = await register(app.request, 'persist@example.test');
  await app.stop();
  const inspect = new DatabaseSync(database);
  const row = inspect.prepare('SELECT * FROM users').get();
  assert.notEqual(row.password_hash, password); assert.notEqual(row.recovery_hash, user.body.recoveryCode);
  assert.equal(row.password_hash.split(':')[1].length, 128);
  inspect.close();
  app = await start({ database, now: () => time }); t.after(app.stop);
  assert.equal((await app.request('/auth/session', { cookie: user.cookie })).body.user.id, user.body.user.id);
  time += 8 * 24 * 60 * 60 * 1000;
  assert.equal((await app.request('/auth/session', { cookie: user.cookie })).body.user, null);
});

test('rate limits repeated authentication attempts', async t => {
  const app = await start(); t.after(app.stop);
  for (let index = 0; index < 20; index++) assert.equal((await app.request('/auth/register', { method: 'POST', body: { email: 'limit@example.test', password: 'short' } })).status, 400);
  assert.equal((await app.request('/auth/register', { method: 'POST', body: { email: 'limit@example.test', password: 'short' } })).status, 429);
});

test('legacy service imports are owner-only, atomic, and repeatable without duplication', async t => {
  const app = await start(); t.after(app.stop);
  const owner = await register(app.request, 'import-owner@example.test', 'business');
  const customer = await register(app.request, 'import-customer@example.test');
  const body = { services: [{ name: 'Original shirt', price: 25 }] };
  assert.equal((await app.request('/services/import', { method: 'POST', cookie: customer.cookie, body })).status, 403);
  assert.equal((await app.request('/services/import', { method: 'POST', cookie: owner.cookie, body })).status, 200);
  assert.equal((await app.request('/services/import', { method: 'POST', cookie: owner.cookie, body })).status, 200);
  assert.equal((await app.request('/workspace', { cookie: owner.cookie })).body.services.length, 1);
  assert.equal((await app.request('/services/import', { method: 'POST', cookie: owner.cookie, body: { services: [{ name: 'Valid', price: 5 }, { name: 'Invalid', price: -1 }] } })).status, 400);
  assert.equal((await app.request('/workspace', { cookie: owner.cookie })).body.services.length, 1);
});

test('AI reviews are owner-only, use saved request context, cache results, and persist edited replies', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'quoteflow-review-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const database = join(dir, 'review.sqlite');
  let calls = 0;
  const aiReview = async ({ quote, services }) => {
    calls++;
    assert.deepEqual(quote, { name: 'Shirt', quantity: 5, request: 'Blue shirts' });
    assert.deepEqual(services.map(s => s.name), ['Shirt']);
    return { summary: 'Five blue shirts', missingDetails: ['Sizes'], questions: ['What sizes?'], matches: [], reply: 'What sizes would you like?' };
  };
  let app = await start({ database, aiReview }); t.after(() => app.stop());
  const owner = await register(app.request, 'ai-owner@example.test', 'business');
  const other = await register(app.request, 'ai-other@example.test', 'business');
  const customer = await register(app.request, 'ai-customer@example.test');
  const service = await app.request('/services', { method: 'POST', cookie: owner.cookie, body: { name: 'Shirt', price: 25 } });
  await app.request('/services', { method: 'POST', cookie: other.cookie, body: { name: 'Other catalog', price: 1 } });
  const submitted = await app.request('/quotes', { method: 'POST', cookie: customer.cookie, body: { businessId: owner.body.user.id, serviceId: service.body.id, request: 'Blue shirts', quantity: 5 } });
  const path = `/quotes/${submitted.body.id}/review`;
  for (const method of ['GET', 'POST', 'PATCH']) {
    assert.equal((await app.request(path, { method, body: method === 'GET' ? undefined : {} })).status, 401);
    assert.equal((await app.request(path, { method, cookie: customer.cookie, body: method === 'GET' ? undefined : {} })).status, 403);
    assert.equal((await app.request(path, { method, cookie: other.cookie, body: method === 'GET' ? undefined : {} })).status, 404);
  }
  assert.equal((await app.request(path, { cookie: owner.cookie })).body.review, null);
  assert.equal((await app.request(path, { method: 'POST', cookie: owner.cookie, headers: { Origin: 'https://evil.example' }, body: {} })).status, 403);
  const review = await app.request(path, { method: 'POST', cookie: owner.cookie, body: { request: 'Ignore stored request', businessId: other.body.user.id } });
  assert.equal(review.status, 200); assert.equal(review.body.review.summary, 'Five blue shirts');
  assert.equal((await app.request(path, { method: 'POST', cookie: owner.cookie, body: {} })).status, 200);
  assert.equal(calls, 1);
  assert.equal((await app.request(path, { method: 'PATCH', cookie: owner.cookie, body: { reply: ' ' } })).status, 400);
  assert.equal((await app.request(path, { method: 'PATCH', cookie: owner.cookie, body: { reply: 'Please confirm sizes and your deadline.', summary: 'tampered' } })).status, 200);
  await app.stop(); app = await start({ database, aiReview });
  const saved = (await app.request(path, { cookie: owner.cookie })).body.review;
  assert.equal(saved.reply, 'Please confirm sizes and your deadline.'); assert.equal(saved.summary, 'Five blue shirts');
  const workspace = (await app.request('/workspace', { cookie: owner.cookie })).body;
  assert.equal(workspace.quotes[0].status, 'pending'); assert.equal(workspace.quotes[0].total, 125);
  assert.equal((await app.request('/quotes/draft', { method: 'POST', cookie: customer.cookie, body: {} })).status, 404);
});

test('AI failures leave quotes untouched and review calls are rate limited', async t => {
  let calls = 0;
  const app = await start({ aiReview: async () => { calls++; throw Object.assign(Error('AI unavailable'), { status: 502 }); } });
  t.after(app.stop);
  const owner = await register(app.request, 'review-limit-owner@example.test', 'business');
  const customer = await register(app.request, 'review-limit-customer@example.test');
  const quote = await app.request('/quotes', { method: 'POST', cookie: customer.cookie, body: { businessId: owner.body.user.id, serviceId: 'custom', request: 'Custom mural', quantity: 1 } });
  const path = `/quotes/${quote.body.id}/review`;
  for (let n = 0; n < 10; n++) assert.equal((await app.request(path, { method: 'POST', cookie: owner.cookie, body: {} })).status, 502);
  assert.equal((await app.request(path, { method: 'POST', cookie: owner.cookie, body: {} })).status, 429);
  assert.equal(calls, 10);
  assert.equal((await app.request(path, { cookie: owner.cookie })).body.review, null);
  assert.equal((await app.request('/workspace', { cookie: owner.cookie })).body.quotes[0].status, 'pending');
});

test('customer request, catalog snapshot, edited approval, and acceptance survive server restarts', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'quoteflow-workflow-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const database = join(dir, 'workflow.sqlite');
  let app = await start({ database });
  t.after(() => app.stop());
  const owner = await register(app.request, 'workflow-owner@example.test', 'business');
  const customer = await register(app.request, 'workflow-customer@example.test');
  const service = await app.request('/services', { method: 'POST', cookie: owner.cookie, body: { name: 'Design', price: 65 } });
  const quote = await app.request('/quotes', { method: 'POST', cookie: customer.cookie, body: { businessId: owner.body.user.id, serviceId: service.body.id, request: 'Three launch posts', quantity: 3 } });
  assert.equal(quote.status, 201);
  await app.request(`/services/${service.body.id}`, { method: 'PATCH', cookie: owner.cookie, body: { name: 'Design updated', price: 99 } });
  await app.stop(); app = await start({ database });
  const pending = (await app.request('/workspace', { cookie: owner.cookie })).body.quotes[0];
  assert.equal(pending.total, 195); assert.equal(pending.name, 'Design'); assert.equal(pending.status, 'pending');
  assert.equal((await app.request(`/quotes/${quote.body.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'approved', price: 70 } })).status, 200);
  assert.equal((await app.request(`/quotes/${quote.body.id}`, { method: 'PATCH', cookie: customer.cookie, body: { status: 'accepted' } })).status, 200);
  await app.stop(); app = await start({ database });
  const accepted = (await app.request('/workspace', { cookie: customer.cookie })).body.quotes[0];
  assert.equal(accepted.status, 'accepted'); assert.equal(accepted.total, 210);
});

test('concurrent AI clicks do not duplicate calls and approval during review prevents stale save', async t => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const app = await start({ aiReview: async () => { calls++; entered(); await blocked; return { summary: 'Test', missingDetails: [], questions: [], matches: [], reply: 'Thanks.' }; } });
  t.after(app.stop);
  const owner = await register(app.request, 'concurrent-owner@example.test', 'business');
  const customer = await register(app.request, 'concurrent-customer@example.test');
  const quote = await app.request('/quotes', { method: 'POST', cookie: customer.cookie, body: { businessId: owner.body.user.id, serviceId: 'custom', request: 'Mural', quantity: 1 } });
  const path = `/quotes/${quote.body.id}/review`;
  const pending = app.request(path, { method: 'POST', cookie: owner.cookie, body: {} });
  await started;
  try {
    assert.equal((await app.request(path, { method: 'POST', cookie: owner.cookie, body: {} })).status, 409);
    assert.equal((await app.request(`/quotes/${quote.body.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'approved', price: 300 } })).status, 200);
  } finally { release(); }
  assert.equal((await pending).status, 409); assert.equal(calls, 1);
  assert.equal((await app.request(path, { cookie: owner.cookie })).body.review, null);
  assert.equal((await app.request(path, { method: 'POST', cookie: owner.cookie, body: {} })).status, 409);
});

test('request conversation is participant-only, preserves text and survives restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'quoteflow-messages-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const database = join(dir, 'messages.sqlite');
  let app = await start({ database }); t.after(() => app.stop());
  const owner = await register(app.request, 'thread-owner@example.test', 'business');
  const customer = await register(app.request, 'thread-customer@example.test');
  const stranger = await register(app.request, 'thread-stranger@example.test');
  const other = await register(app.request, 'thread-other@example.test', 'business');
  const quote = await app.request('/quotes', { method: 'POST', cookie: customer.cookie, body: { businessId: owner.body.user.id, serviceId: 'custom', quantity: 12, request: 'Navy shirts\nTiming: next Friday' } });
  const path = `/quotes/${quote.body.id}/messages`;
  assert.equal((await app.request(path)).status, 401);
  for (const method of ['GET', 'POST']) for (const account of [stranger, other]) assert.equal((await app.request(path, { method, cookie: account.cookie, ...(method === 'POST' ? { body: { message: 'Intrusion' } } : {}) })).status, 404);
  assert.equal((await app.request(path, { cookie: owner.cookie })).body.messages.length, 0);
  assert.equal((await app.request(path, { method: 'POST', cookie: owner.cookie, headers: { Origin: 'https://evil.example' }, body: { message: 'Bad' } })).status, 403);
  for (const message of ['', '   ', 'x'.repeat(3001)]) assert.equal((await app.request(path, { method: 'POST', cookie: owner.cookie, body: { message } })).status, 400);
  const sent = await app.request(path, { method: 'POST', cookie: owner.cookie, body: { message: 'Do you have the logo file?', senderId: customer.body.user.id, role: 'customer' } });
  assert.equal(sent.status, 200); assert.equal(sent.body.messages[0].role, 'business');
  assert.equal((await app.request(path, { method: 'POST', cookie: customer.cookie, body: { message: 'Yes, artwork is ready. Please print on the front.' } })).status, 200);
  await app.stop(); app = await start({ database });
  const messages = (await app.request(path, { cookie: customer.cookie })).body.messages;
  assert.deepEqual(messages.map(m => m.role), ['business', 'customer']);
  assert.equal(messages[1].body, 'Yes, artwork is ready. Please print on the front.');
  const savedQuote = (await app.request('/workspace', { cookie: owner.cookie })).body.quotes[0];
  assert.equal(savedQuote.status, 'pending'); assert.equal(savedQuote.total, null);
});

test('customer AI follow-up uses selected business catalog without saving or pricing a request', async t => {
  let calls = 0;
  const app = await start({ aiReview: async ({ quote, services }) => {
    calls++; assert.equal(quote.name, 'Shirts'); assert.equal(quote.quantity, 12);
    assert.deepEqual(services.map(s => s.name), ['Shirts']);
    return { questions: ['Is your artwork ready?'] };
  } }); t.after(app.stop);
  const owner = await register(app.request, 'guide-owner@example.test', 'business');
  const other = await register(app.request, 'guide-other@example.test', 'business');
  const customer = await register(app.request, 'guide-customer@example.test');
  const service = await app.request('/services', { method: 'POST', cookie: owner.cookie, body: { name: 'Shirts', price: 25 } });
  const otherService = await app.request('/services', { method: 'POST', cookie: other.cookie, body: { name: 'Other catalog', price: 10 } });
  const body = { businessId: owner.body.user.id, serviceId: service.body.id, quantity: 12, request: 'Navy shirts for Friday' };
  const path = '/requests/guide';
  assert.equal((await app.request(path, { method: 'POST', body })).status, 401);
  assert.equal((await app.request(path, { method: 'POST', cookie: owner.cookie, body })).status, 403);
  assert.equal((await app.request(path, { method: 'POST', cookie: customer.cookie, body: { ...body, serviceId: otherService.body.id } })).status, 404);
  assert.equal((await app.request(path, { method: 'POST', cookie: customer.cookie, body: { ...body, quantity: -1 } })).status, 400);
  for (let i = 0; i < 10; i++) {
    const result = await app.request(path, { method: 'POST', cookie: customer.cookie, body });
    assert.equal(result.status, 200); assert.deepEqual(result.body, { question: 'Is your artwork ready?' });
  }
  assert.equal((await app.request(path, { method: 'POST', cookie: customer.cookie, body })).status, 429);
  assert.equal(calls, 10);
  assert.equal((await app.request('/workspace', { cookie: customer.cookie })).body.quotes.length, 0);
});

async function enableWidget(app, owner) {
  const result = await app.request('/widget-settings', { method: 'POST', cookie: owner.cookie, body: { enabled: true, origins: ['https://studio.example'] } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
}
async function previewToken(app, owner, subject) {
  const mail = (await app.request('/notifications', { cookie: owner.cookie })).body.mail.find(m => m.subject === subject);
  assert.ok(mail, subject);
  const preview = await app.request(`/mail/${mail.id}/preview`, { cookie: owner.cookie });
  assert.equal(preview.status, 200);
  return preview.body.body.match(/#token=([a-f0-9]{64})/)[1];
}

test('guest widget supports private verification, trusted pricing, conversation, approval and notifications', async t => {
  let time = Date.now();
  const dir = await mkdtemp(join(tmpdir(), 'quoteflow-widget-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const database = join(dir, 'widget.sqlite');
  let app = await start({ database, now: () => time }); t.after(() => app.stop());
  const owner = await register(app.request, 'widget-owner@example.test', 'business');
  const stranger = await register(app.request, 'widget-stranger@example.test', 'business');
  const existingCustomer = await register(app.request, 'existing-guest@example.test');
  const businessId = owner.body.user.id;
  assert.equal((await app.request(`/public/businesses/${businessId}`)).status, 404);
  await enableWidget(app, owner);
  assert.equal(app.frameAncestors(businessId), "'self' https://studio.example");
  const service = await app.request('/services', { method: 'POST', cookie: owner.cookie, body: { name: 'Shirts', price: 25 } });
  const catalog = await app.request(`/public/businesses/${businessId}`);
  assert.equal(catalog.status, 200); assert.equal(catalog.body.services[0].price, 25);
  assert.equal(catalog.body.business.email, undefined);
  const body = { businessId, serviceId: service.body.id, quantity: 12, request: 'Navy shirts for Friday', name: 'Guest Jordan', email: 'existing-guest@example.test', submissionKey: 'test-submission-123', total: 1, status: 'approved' };
  assert.equal((await app.request('/public/requests', { method: 'POST', body: { ...body, website: 'bot' } })).status, 400);
  const submitted = await app.request('/public/requests', { method: 'POST', body });
  assert.equal(submitted.status, 201); assert.equal(submitted.body.token, undefined); assert.equal(submitted.body.quoteId, undefined);
  assert.equal((await app.request('/public/requests', { method: 'POST', body })).status, 200);
  assert.equal((await app.request('/public/requests', { method: 'POST', body: { ...body, quantity: 1 } })).status, 409);
  const workspace = (await app.request('/workspace', { cookie: owner.cookie })).body;
  assert.equal(workspace.quotes.length, 1); assert.equal(workspace.quotes[0].total, 300); assert.equal(workspace.quotes[0].status, 'pending');
  const quoteId = workspace.quotes[0].id;
  assert.equal((await app.request('/workspace', { cookie: existingCustomer.cookie })).body.quotes.length, 0);
  assert.equal((await app.request(`/quotes/${quoteId}/messages`, { cookie: existingCustomer.cookie })).status, 404);
  const ownerNotifications = (await app.request('/notifications', { cookie: owner.cookie })).body;
  assert.equal(ownerNotifications.notifications.length, 1); assert.equal(ownerNotifications.notifications[0].readAt, null);
  assert.equal((await app.request('/notifications', { cookie: stranger.cookie })).body.mail.length, 0);
  const mailId = ownerNotifications.mail[0].id;
  assert.equal((await app.request(`/mail/${mailId}/preview`, { cookie: stranger.cookie })).status, 404);
  const token = await previewToken(app, owner, 'Confirm your email and track your request');
  const headers = { 'X-QuoteFlow-Token': token };
  assert.equal((await app.request('/track')).status, 401);
  assert.equal((await app.request('/track', { headers })).body.needsConfirmation, true);
  assert.equal((await app.request('/track/messages', { method: 'POST', headers, body: { message: 'Too early' } })).status, 403);
  assert.equal((await app.request('/track/confirm', { method: 'POST', headers, body: {} })).status, 200);
  assert.equal((await app.request('/track', { headers })).body.quote.total, 300);
  assert.equal((await app.request(`/quotes/${quoteId}/messages`, { method: 'POST', cookie: owner.cookie, body: { message: 'Is artwork ready?' } })).status, 200);
  assert.equal((await app.request('/track', { headers })).body.messages[0].body, 'Is artwork ready?');
  assert.equal((await app.request('/track/messages', { method: 'POST', headers, body: { message: 'Yes, front logo please.' } })).status, 201);
  assert.equal((await app.request(`/quotes/${quoteId}`, { method: 'PATCH', cookie: owner.cookie, body: { price: 30, status: 'approved' } })).status, 200);
  assert.equal((await app.request('/track/status', { method: 'POST', headers, body: { status: 'accepted', total: 1 } })).status, 200);
  assert.equal((await app.request('/track/status', { method: 'POST', headers, body: { status: 'accepted' } })).status, 409);
  assert.equal((await app.request('/track', { headers })).body.quote.total, 360);
  await app.stop(); app = await start({ database, now: () => time });
  const persisted = (await app.request('/track', { headers })).body;
  assert.equal(persisted.quote.status, 'accepted'); assert.equal(persisted.messages.length, 2);
  assert.ok(persisted.notifications.some(n => n.title === 'Your quote is approved'));
  await app.request('/track/read', { method: 'POST', headers, body: {} });
  assert.ok((await app.request('/track', { headers })).body.notifications.every(n => n.read_at !== null));
  time += 31 * 86400000;
  assert.equal((await app.request('/track', { headers })).status, 401);
});

test('business email confirmation releases queued notices and recovery does not enumerate guests', async t => {
  const app = await start(); t.after(app.stop);
  const owner = await register(app.request, 'verify-owner@example.test', 'business');
  await enableWidget(app, owner);
  await app.request('/public/requests', { method: 'POST', body: { businessId: owner.body.user.id, serviceId: 'custom', quantity: 1, request: 'Custom mural', name: 'Guest', email: 'guest@example.test', submissionKey: 'verify-test' } });
  assert.ok((await app.request('/notifications', { cookie: owner.cookie })).body.mail.some(m => m.state === 'unverified'));
  assert.equal((await app.request('/email/verify', { method: 'POST', cookie: owner.cookie, body: {} })).status, 200);
  const token = await previewToken(app, owner, 'Verify your QuoteFlow email');
  assert.equal((await app.request('/email/confirm', { method: 'POST', body: { token } })).status, 200);
  assert.equal((await app.request('/email/confirm', { method: 'POST', body: { token } })).status, 400);
  assert.equal((await app.request('/notifications', { cookie: owner.cookie })).body.verified, true);
  assert.ok(!(await app.request('/notifications', { cookie: owner.cookie })).body.mail.some(m => m.state === 'unverified'));
  const actual = await app.request('/public/recover-link', { method: 'POST', body: { businessId: owner.body.user.id, email: 'guest@example.test' } });
  const unknown = await app.request('/public/recover-link', { method: 'POST', body: { businessId: owner.body.user.id, email: 'unknown@example.test' } });
  assert.deepEqual(actual.body, unknown.body);
  assert.equal((await app.request('/widget-settings', { method: 'POST', cookie: owner.cookie, body: { enabled: true, origins: ['https://studio.example/path'] } })).status, 400);
});

test('mail queue retries with a stable idempotency key and does not lose requests or duplicate accepted mail', async t => {
  let time = Date.now(); let attempts = 0; const ids = [];
  const dir = await mkdtemp(join(tmpdir(), 'quoteflow-mail-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const database = join(dir, 'mail.sqlite');
  const options = { database, now: () => time, mailMode: 'resend', mailTransport: async mail => { attempts++; ids.push(mail.id); if (attempts === 1) throw Error('Temporary outage'); return 'provider-123'; } };
  let app = await start(options); t.after(() => app.stop());
  const owner = await register(app.request, 'queue-owner@example.test', 'business'); await enableWidget(app, owner);
  assert.equal((await app.request('/public/requests', { method: 'POST', body: { businessId: owner.body.user.id, serviceId: 'custom', quantity: 1, request: 'Mural', name: 'Guest', email: 'guest@example.test', submissionKey: 'queue-request' } })).status, 201);
  await app.flushMail(); assert.equal(attempts, 1);
  const state = (await app.request('/notifications', { cookie: owner.cookie })).body;
  assert.equal(state.mail.find(m => m.subject === 'Confirm your email and track your request').state, 'queued');
  assert.equal((await app.request('/workspace', { cookie: owner.cookie })).body.quotes.length, 1);
  await app.stop(); app = await start(options);
  time += 61000; await app.flushMail(); await app.flushMail();
  assert.equal(attempts, 2); assert.equal(ids[0], ids[1]);
  const accepted = (await app.request('/notifications', { cookie: owner.cookie })).body.mail.find(m => m.subject === 'Confirm your email and track your request');
  assert.equal(accepted.state, 'sent'); assert.equal(accepted.attempts, 2);
  assert.equal((await app.request(`/mail/${accepted.id}/preview`, { cookie: owner.cookie })).status, 404);
});

test('signed delivery callbacks update status; forged events cannot, and late delivery cannot hide a bounce', async t => {
  const { Webhook } = await import('svix');
  const secret = `whsec_${Buffer.from('a-test-secret-with-at-least-32-bytes').toString('base64')}`;
  const app = await start({ mailMode: 'resend', mailWebhookSecret: secret, mailTransport: async () => 'provider-webhook-test' }); t.after(app.stop);
  const owner = await register(app.request, 'webhook-owner@example.test', 'business');
  await app.request('/email/verify', { method: 'POST', cookie: owner.cookie, body: {} }); await app.flushMail();
  const event = { type: 'email.delivered', data: { email_id: 'provider-webhook-test' } };
  assert.equal((await app.request('/mail/webhook', { method: 'POST', body: event })).status, 400);
  async function postEvent(type, id) {
    const body = { ...event, type }; const date = new Date();
    return app.request('/mail/webhook', { method: 'POST', body, headers: { Origin: '', 'X-QuoteFlow-Request': '', 'svix-id': id, 'svix-timestamp': String(Math.floor(date.getTime()/1000)), 'svix-signature': new Webhook(secret).sign(id, date, JSON.stringify(body)) } });
  }
  assert.equal((await postEvent('email.delivered', 'delivered-1')).status, 200);
  assert.equal((await app.request('/notifications', { cookie: owner.cookie })).body.mail[0].state, 'delivered');
  assert.equal((await postEvent('email.bounced', 'bounced-1')).status, 200);
  await postEvent('email.delivered', 'delivered-1');
  assert.equal((await app.request('/notifications', { cookie: owner.cookie })).body.mail[0].state, 'bounced');
  await app.request('/email/verify', { method: 'POST', cookie: owner.cookie, body: {} });
  assert.equal((await app.request('/notifications', { cookie: owner.cookie })).body.mail[0].state, 'suppressed');
});

test('mail exhaustion is visible and public widgets stay disabled without email delivery', async t => {
  let time = Date.now(); let attempts = 0;
  const app = await start({ now: () => time, mailMode: 'resend', mailTransport: async () => { attempts++; throw Error('outage'); } }); t.after(app.stop);
  const owner = await register(app.request, 'failed-email-owner@example.test', 'business');
  await app.request('/email/verify', { method: 'POST', cookie: owner.cookie, body: {} });
  for (let n = 0; n < 6; n++) { await app.flushMail(); time += 3600000; }
  assert.equal(attempts, 5);
  const mail = (await app.request('/notifications', { cookie: owner.cookie })).body.mail[0];
  assert.equal(mail.state, 'failed'); assert.ok(mail.error);
  const disabled = await start({ mailMode: 'disabled' }); t.after(disabled.stop);
  const disabledOwner = await register(disabled.request, 'disabled-owner@example.test', 'business');
  assert.equal((await disabled.request('/widget-settings', { method: 'POST', cookie: disabledOwner.cookie, body: { enabled: true, origins: [] } })).status, 400);
});

test('production requires verified business email, forbids previews and limits frame permissions', async t => {
  let verifyMail;
  const app = await start({ secure: true, mailMode: 'resend', mailTransport: async mail => { verifyMail = mail; return 'verify-secure-id'; } }); t.after(app.stop);
  const owner = await register(app.request, 'secure-widget-owner@example.test', 'business');
  const requestSettings = body => app.request('/widget-settings', { method: 'POST', cookie: owner.cookie, body });
  assert.equal((await requestSettings({ enabled: true, origins: ['https://studio.example'] })).status, 400);
  await app.request('/email/verify', { method: 'POST', cookie: owner.cookie, body: {} }); await app.flushMail();
  const token = verifyMail.text.match(/#token=([a-f0-9]{64})/)[1];
  await app.request('/email/confirm', { method: 'POST', body: { token } });
  assert.equal((await requestSettings({ enabled: true, origins: ['http://studio.example'] })).status, 400);
  assert.equal((await requestSettings({ enabled: true, origins: ['https://studio.example'] })).status, 200);
  assert.equal(app.frameAncestors(owner.body.user.id), "'self' https://studio.example");
  const mail = (await app.request('/notifications', { cookie: owner.cookie })).body.mail[0];
  assert.equal((await app.request(`/mail/${mail.id}/preview`, { cookie: owner.cookie })).status, 404);
  await requestSettings({ enabled: false, origins: [] });
  assert.equal(app.frameAncestors(owner.body.user.id), "'none'");
  assert.equal((await app.request(`/public/businesses/${owner.body.user.id}`)).status, 404);
});

test('payment API enforces customer ownership, accepted pricing, CSRF, and business receipts', async t => {
  const config = { businessId: 'configured-after-registration', merchantId: 'MERCHANT123' };
  let payload, paid = false, captures = 0;
  const transport = async (path, options = {}) => {
    if (path === '/v2/checkout/orders') { payload = options.body; return { id: 'ORDER123456', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER123456' }] }; }
    if (path.endsWith('/capture')) { captures++; paid = true; return {}; }
    const order = { ...structuredClone(payload), id: 'ORDER123456', status: paid ? 'COMPLETED' : 'APPROVED' };
    if (paid) order.purchase_units[0].payments = { captures: [{ id: 'CAPTURE12345', status: 'COMPLETED', amount: { currency_code: 'USD', value: '60.00' }, final_capture: true }] };
    return order;
  };
  const app = await start({ paypalConfig: config, paypalTransport: transport }); t.after(app.stop);
  const owner = await register(app.request, 'pay-owner@example.test', 'business'); config.businessId = owner.body.user.id;
  const buyer = await register(app.request, 'pay-buyer@example.test');
  const stranger = await register(app.request, 'pay-stranger@example.test');
  const result = await app.request('/quotes', { method: 'POST', cookie: buyer.cookie, body: { businessId: config.businessId, serviceId: 'custom', quantity: 2, request: 'Demo' } });
  const quotePath = `/quotes/${result.body.id}`, path = `${quotePath}/payment`;
  const post = (cookie, action, extra = {}) => app.request(path, { method: 'POST', cookie, body: { action, total: 0.01 }, ...extra });
  assert.equal((await post(buyer.cookie, 'create')).status, 409);
  await app.request(quotePath, { method: 'PATCH', cookie: owner.cookie, body: { status: 'approved', price: 30 } });
  await app.request(quotePath, { method: 'PATCH', cookie: buyer.cookie, body: { status: 'accepted' } });
  assert.equal((await post('', 'create')).status, 401);
  assert.equal((await post(stranger.cookie, 'create')).status, 404);
  assert.equal((await post(owner.cookie, 'create')).status, 403);
  assert.equal((await post(buyer.cookie, 'create', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await post(buyer.cookie, 'create')).status, 200);
  assert.equal(payload.purchase_units[0].amount.value, '60.00');
  assert.equal((await app.request(path, { cookie: owner.cookie })).body.approvalUrl, null);
  assert.equal((await post(buyer.cookie, 'capture')).body.state, 'paid');
  assert.equal((await post(buyer.cookie, 'capture')).body.state, 'paid'); assert.equal(captures, 1);
  assert.equal((await app.request(path, { cookie: owner.cookie })).body.captureId, 'CAPTURE12345');
  for (const user of [owner, buyer]) assert.equal((await app.request('/notifications', { cookie: user.cookie })).body.notifications.filter(n => n.title.startsWith('Sandbox payment confirmed')).length, 1);
});

test('private-link payment requires a valid verified token and stays unavailable without configuration', async t => {
  const app = await start(); t.after(app.stop);
  const owner = await register(app.request, 'pay-guest-owner@example.test', 'business'); await enableWidget(app, owner);
  await app.request('/public/requests', { method: 'POST', body: { businessId: owner.body.user.id, serviceId: 'custom', quantity: 1, request: 'Demo', name: 'Guest', email: 'guest@example.test', submissionKey: 'payment-guest' } });
  const token = await previewToken(app, owner, 'Confirm your email and track your request');
  const headers = { 'X-QuoteFlow-Token': token };
  assert.equal((await app.request('/track/payment')).status, 401);
  assert.equal((await app.request('/track/payment', { headers })).status, 403);
  await app.request('/track/confirm', { method: 'POST', headers, body: {} });
  assert.equal((await app.request('/track/payment', { headers })).body.available, false);
  assert.equal((await app.request('/track/payment', { method: 'POST', headers, body: { action: 'create' } })).status, 503);
});

test('verified widget customer completes sandbox checkout and owner sees the receipt', async t => {
  const config = { businessId: 'demo', merchantId: 'MERCHANT123' }; let payload, paid = false;
  const app = await start({ paypalConfig: config, paypalTransport: async (path, options = {}) => {
    if (path === '/v2/checkout/orders') { payload = options.body; return { id: 'GUESTORDER123', links: [{ rel: 'payer-action', href: 'https://www.sandbox.paypal.com/checkoutnow?token=GUESTORDER123' }] }; }
    if (path.endsWith('/capture')) { paid = true; return {}; }
    const order = { ...structuredClone(payload), id: 'GUESTORDER123', status: paid ? 'COMPLETED' : 'APPROVED' };
    if (paid) order.purchase_units[0].payments = { captures: [{ id: 'GUESTCAPTURE123', status: 'COMPLETED', amount: { currency_code: 'USD', value: '300.00' }, final_capture: true }] };
    return order;
  } }); t.after(app.stop);
  const owner = await register(app.request, 'guest-pay-owner@example.test', 'business'); config.businessId = owner.body.user.id; await enableWidget(app, owner);
  await app.request('/public/requests', { method: 'POST', body: { businessId: config.businessId, serviceId: 'custom', quantity: 12, request: 'Fictional shirt order', name: 'Demo', email: 'demo@example.test', submissionKey: 'guest-pay-complete' } });
  const headers = { 'X-QuoteFlow-Token': await previewToken(app, owner, 'Confirm your email and track your request') };
  await app.request('/track/confirm', { method: 'POST', headers, body: {} });
  const id = (await app.request('/track', { headers })).body.quote.id;
  await app.request(`/quotes/${id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'approved', price: 25 } });
  await app.request('/track/status', { method: 'POST', headers, body: { status: 'accepted' } });
  assert.equal((await app.request('/track/payment', { method: 'POST', headers, body: { action: 'create', amount: 1 } })).status, 200);
  assert.equal((await app.request('/track/payment', { method: 'POST', headers, body: { action: 'capture', orderId: 'ATTACKER' } })).body.state, 'paid');
  assert.equal((await app.request(`/quotes/${id}/payment`, { cookie: owner.cookie })).body.captureId, 'GUESTCAPTURE123');
  assert.equal((await app.request('/track/payment', { headers })).body.amount, 300);
  assert.ok((await app.request('/track', { headers })).body.notifications.some(n => n.title.startsWith('Sandbox payment confirmed')));
});

test('profiles protect customer privacy and ratings require participation and acceptance', async t => {
  const app = await start(); t.after(app.stop);
  const owner = await register(app.request, 'profile-owner@example.test', 'business');
  const buyer = await register(app.request, 'profile-buyer@example.test');
  const stranger = await register(app.request, 'profile-stranger@example.test');
  const id = buyer.body.user.id;
  const save = (body, cookie = buyer.cookie) => app.request('/profile', {method:'PATCH',cookie,body});
  assert.equal((await save({bio:'About me',avatar:'',banner:''})).status,200);
  assert.equal((await save({bio:'No',avatar:'https://tracker.example/image.jpg',banner:''})).status,400);
  assert.equal((await save({bio:'No',avatar:'data:image/svg+xml;base64,AAAA',banner:''})).status,400);
  assert.equal((await save({bio:'No',avatar:'data:image/jpeg;base64,AAAA',banner:''})).status,400);
  assert.equal((await save({bio:'x'.repeat(301),avatar:'',banner:''})).status,400);
  assert.equal((await app.request(`/profiles/${id}`,{cookie:stranger.cookie})).status,404);
  assert.equal((await app.request(`/profiles/${id}`,{cookie:owner.cookie})).status,404);
  assert.equal((await app.request(`/profiles/${id}`,{cookie:buyer.cookie})).body.bio,'About me');
  const quote = await app.request('/quotes',{method:'POST',cookie:buyer.cookie,body:{businessId:owner.body.user.id,serviceId:'custom',quantity:1,request:'Demo'}});
  const path = `/quotes/${quote.body.id}`;
  const rate = (stars,cookie=buyer.cookie) => app.request(path+'/rating',{method:'POST',cookie,body:{stars,targetId:stranger.body.user.id}});
  assert.equal((await rate(5)).status,409);
  assert.equal((await rate(5,stranger.cookie)).status,404);
  const visible=await app.request(`/profiles/${id}`,{cookie:owner.cookie});
  assert.equal(visible.status,200); assert.equal(visible.body.email,undefined);
  await app.request(path,{method:'PATCH',cookie:owner.cookie,body:{status:'approved',price:25}});
  await app.request(path,{method:'PATCH',cookie:buyer.cookie,body:{status:'accepted'}});
  assert.equal((await rate(6)).status,400);
  assert.equal((await rate(4.5)).status,400);
  assert.equal((await rate(5)).status,200);
  await rate(4);
  const profile=(await app.request(`/profiles/${owner.body.user.id}`,{cookie:buyer.cookie})).body;
  assert.deepEqual(profile.rating,{average:4,count:1});
  assert.equal((await rate(3,owner.cookie)).status,200);
  assert.deepEqual((await app.request(`/profiles/${id}`,{cookie:buyer.cookie})).body.rating,{average:3,count:1});
  assert.equal((await app.request(`/profiles/${stranger.body.user.id}`,{cookie:stranger.cookie})).body.rating.count,0);
});
