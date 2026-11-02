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
  return { request, stop: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); api.close(); } };
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

test('AI endpoint requires a customer and scopes catalog to selected business without saving', async t => {
  let calls = 0;
  const app = await start({ aiDraft: async ({ request, services }) => {
    calls++;
    assert.equal(request, 'Five shirts');
    assert.deepEqual(services.map(s => s.name), ['Shirt']);
    assert.equal(services[0].cents, 2500);
    return { quote: null, clarifyingQuestion: 'Which size?' };
  } });
  t.after(app.stop);
  const owner = await register(app.request, 'ai-owner@example.test', 'business');
  const other = await register(app.request, 'ai-other@example.test', 'business');
  const customer = await register(app.request, 'ai-customer@example.test');
  await app.request('/services', { method: 'POST', cookie: owner.cookie, body: { name: 'Shirt', price: 25 } });
  await app.request('/services', { method: 'POST', cookie: other.cookie, body: { name: 'Private catalog', price: 1 } });
  const body = { businessId: owner.body.user.id, request: 'Five shirts' };
  assert.equal((await app.request('/quotes/draft', { method: 'POST', body })).status, 401);
  assert.equal((await app.request('/quotes/draft', { method: 'POST', cookie: owner.cookie, body })).status, 403);
  assert.equal((await app.request('/quotes/draft', { method: 'POST', cookie: customer.cookie, body: { ...body, request: '' } })).status, 400);
  for (let n = 0; n < 10; n++) assert.equal((await app.request('/quotes/draft', { method: 'POST', cookie: customer.cookie, body })).status, 200);
  assert.equal((await app.request('/quotes/draft', { method: 'POST', cookie: customer.cookie, body })).status, 429);
  assert.equal(calls, 10);
  assert.equal((await app.request('/workspace', { cookie: customer.cookie })).body.quotes.length, 0);
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
