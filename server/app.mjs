import { createPayments } from './paypal.mjs';
import { createEngagement } from './engagement.mjs';
import { reviewRequest } from './ai.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const lifetime = 7 * 24 * 60 * 60 * 1000;
const publicUser = row => ({ id: row.id, name: row.name, email: row.email, role: row.role, businessName: row.business_name });
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `Enter a valid ${label}.`);
  return value.trim();
};
const money = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) fail(400, 'Enter a price from $0 to $1,000,000.');
  return Math.round(value * 100);
};
const passwordValid = value => {
  if (typeof value !== 'string' || value.length < 15 || value.length > 128) fail(400, 'Use a password between 15 and 128 characters.');
};
async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${key.toString('hex')}`;
}
async function checkPassword(password, saved) {
  const result = await hashPassword(password, saved.split(':')[0]);
  return timingSafeEqual(Buffer.from(result), Buffer.from(saved));
}
async function bodyOf(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'Send JSON data.');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 32768) fail(413, 'Request is too large.');
  }
  try { const value = JSON.parse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
  catch { fail(400, 'Invalid request data.'); }
}

export async function createApi({ database = ':memory:', origin = 'http://127.0.0.1:5173', secure = false, now = Date.now, aiReview = reviewRequest, mailMode, mailKey, mailFrom, mailTransport, mailWebhookSecret, paypalConfig, paypalTransport } = {}) {
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('business','customer')), business_name TEXT, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL COLLATE NOCASE,
      cents INTEGER NOT NULL CHECK(cents >= 0), UNIQUE(business_id, name));
    CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES users(id), customer_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL, request TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000), cents INTEGER,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','accepted','declined','rejected')), created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS quote_messages (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id), sender_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_quote ON quote_messages(quote_id, created);
    CREATE TABLE IF NOT EXISTS quote_reviews (quote_id TEXT PRIMARY KEY REFERENCES quotes(id), review TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS quotes_customer ON quotes(customer_id);
    CREATE INDEX IF NOT EXISTS quotes_business ON quotes(business_id);`);
  const dummyHash = await hashPassword(randomBytes(24).toString('hex'));
  const attempts = new Map();
  const reviewing = new Set();
  let activeHashes = 0;
  function limit(key, max = 20) {
    const time = now();
    for (const [id, entry] of attempts) if (entry.until <= time) attempts.delete(id);
    const entry = attempts.get(key) ?? { count: 0, until: time + 15 * 60 * 1000 };
    if (++entry.count > max) fail(429, 'Too many attempts. Please try again in 15 minutes.');
    attempts.set(key, entry);
  }
  async function passwordWork(work) {
    if (activeHashes >= 4) fail(503, 'Sign-in is busy. Please try again shortly.');
    activeHashes++;
    try { return await work(); } finally { activeHashes--; }
  }
  const cookieName = secure ? '__Host-quoteflow' : 'quoteflow';
  const cookie = (token, maxAge) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const tokenOf = req => req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) ?? '';
  function session(req) {
    return db.prepare('SELECT users.*, sessions.expires FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires > ?').get(digest(tokenOf(req)), now());
  }
  function startSession(req, res, userId) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ? OR expires <= ?').run(digest(tokenOf(req)), now());
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), userId, now() + lifetime);
    res.setHeader('Set-Cookie', cookie(token, lifetime / 1000));
  }
  function send(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); }
  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = work(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const engagement = createEngagement({ db, origin, secure, now, limit, transaction, bodyOf, send, dummyHash, mailMode, mailKey, mailFrom, mailTransport, mailWebhookSecret });
  const payments = createPayments({ db, origin, now, transaction, quoteEvent: engagement.quoteEvent, config: paypalConfig, transport: paypalTransport });
  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, origin);
      const path = url.pathname;
      const method = req.method;
      if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) fail(405, 'Method not allowed.');
      if (path === '/api/mail/webhook') { await engagement.webhook(req, res); return; }
      if (method !== 'GET') {
        // Requiring JSON plus a custom header blocks cross-site forms; no CORS is enabled.
        if (req.headers['x-quoteflow-request'] !== '1' || req.headers.origin !== origin) fail(403, 'Reload this page before trying again.');
      }
      if (path === '/api/track/payment' && ['GET', 'POST'].includes(method)) {
        const guest = engagement.authorizeGuest(req);
        const quote = db.prepare('SELECT * FROM quotes WHERE id=?').get(guest.quote_id);
        if (method === 'GET') return send(res, 200, payments.info(quote));
        const body = await bodyOf(req);
        if (!['create', 'capture', 'check'].includes(body.action)) fail(400, 'Choose a payment action.');
        limit(`payment:${quote.id}`, 30);
        return send(res, 200, await payments.act(quote, body.action));
      }
      if (await engagement.publicRoutes(req, res, path, method)) return;
      if (path === '/api/auth/session' && method === 'GET') { const user = session(req); return send(res, 200, { user: user ? publicUser(user) : null }); }
      if (['/api/auth/register', '/api/auth/login', '/api/auth/recover'].includes(path) && method === 'POST') {
        limit(`ip:${req.socket.remoteAddress}`, 40);
        const body = await bodyOf(req);
        const email = text(body.email, 254, 'email address').toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
        limit(`email:${email}`);
        if (path.endsWith('/register')) {
          passwordValid(body.password);
          const name = text(body.name, 100, 'name');
          if (!['business', 'customer'].includes(body.role)) fail(400, 'Choose a business or customer account.');
          const businessName = body.role === 'business' ? text(body.businessName, 100, 'business name') : null;
          const hashed = await passwordWork(() => hashPassword(body.password));
          if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) fail(409, 'An account already uses this email. Try signing in.');
          const id = randomUUID();
          const recoveryCode = randomBytes(24).toString('hex');
          db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, email, name, body.role, businessName, hashed, digest(recoveryCode));
          startSession(req, res, id);
          return send(res, 201, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)), recoveryCode });
        }
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (path.endsWith('/login')) {
          if (typeof body.password !== 'string' || body.password.length > 128) fail(401, 'Email or password is incorrect.');
          const valid = await passwordWork(() => checkPassword(body.password, user?.password_hash ?? dummyHash));
          if (!valid || !user) fail(401, 'Email or password is incorrect.');
          startSession(req, res, user.id);
          return send(res, 200, { user: publicUser(user) });
        }
        passwordValid(body.password);
        const code = typeof body.recoveryCode === 'string' ? body.recoveryCode.trim() : '';
        if (!user || !timingSafeEqual(Buffer.from(digest(code)), Buffer.from(user.recovery_hash))) fail(400, 'Email or recovery code is incorrect.');
        const hashed = await passwordWork(() => hashPassword(body.password));
        const recoveryCode = randomBytes(24).toString('hex');
        transaction(() => {
          const result = db.prepare('UPDATE users SET password_hash = ?, recovery_hash = ? WHERE id = ? AND recovery_hash = ?').run(hashed, digest(recoveryCode), user.id, user.recovery_hash);
          if (result.changes !== 1) fail(400, 'This recovery code has already been used.');
          db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
        });
        res.setHeader('Set-Cookie', cookie('', 0));
        return send(res, 200, { recoveryCode });
      }
      const user = session(req);
      if (!user) fail(401, 'Please sign in again.');
      if (req.headers['x-quoteflow-user'] && req.headers['x-quoteflow-user'] !== user.id) fail(401, 'Your account changed. Please sign in again.');
      if (await engagement.accountRoutes(req, res, path, method, user)) return;
      const paymentMatch = path.match(/^\/api\/quotes\/([\w-]+)\/payment$/);
      if (paymentMatch && ['GET', 'POST'].includes(method)) {
        const quote = db.prepare('SELECT * FROM quotes WHERE id=? AND (customer_id=? OR business_id=?)').get(paymentMatch[1], user.id, user.id);
        if (!quote) fail(404, 'Quote not found.');
        if (method === 'GET') return send(res, 200, payments.info(quote, user.id === quote.customer_id));
        const body = await bodyOf(req);
        if (!['create', 'capture', 'check'].includes(body.action)) fail(400, 'Choose a payment action.');
        if (user.id !== quote.customer_id && body.action !== 'check') fail(403, 'Only the customer can start or complete checkout.');
        limit(`payment:${quote.id}`, 30);
        return send(res, 200, await payments.act(quote, body.action));
      }

      if (path === '/api/auth/logout' && method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(tokenOf(req)));
        res.setHeader('Set-Cookie', cookie('', 0));
        return send(res, 200, { ok: true });
      }
      if (path === '/api/workspace' && method === 'GET') {
        const businesses = db.prepare("SELECT id, business_name AS name FROM users WHERE role = 'business' ORDER BY business_name, id").all();
        const businessId = user.role === 'business' ? user.id : (url.searchParams.get('businessId') || businesses[0]?.id || '');
        if (businessId && !businesses.some(item => item.id === businessId)) fail(404, 'Business not found.');
        const services = db.prepare('SELECT id, name, cents / 100.0 AS price FROM services WHERE business_id = ? ORDER BY rowid').all(businessId);
        const quotes = db.prepare(`SELECT q.id, q.name, q.request, q.quantity, q.cents / 100.0 AS price,
          q.cents * q.quantity / 100.0 AS total, q.status, EXISTS(SELECT 1 FROM sandbox_payments p WHERE p.quote_id=q.id AND p.state='paid') AS sandboxPaid, q.business_id AS businessId,
          b.business_name AS businessName, c.name AS customerName FROM quotes q JOIN users b ON b.id = q.business_id
          JOIN users c ON c.id = q.customer_id WHERE q.${user.role === 'business' ? 'business_id' : 'customer_id'} = ? ORDER BY q.created, q.rowid`).all(user.id);
        return send(res, 200, { businesses, businessId, services, quotes });
      }
      if (path === '/api/services/import' && method === 'POST') {
        if (user.role !== 'business') fail(403, 'Only business owners can import services.');
        const body = await bodyOf(req);
        if (!Array.isArray(body.services) || body.services.length < 1 || body.services.length > 100) fail(400, 'Import between 1 and 100 services.');
        const services = body.services.map(item => ({ name: text(item?.name, 100, 'service name'), cents: money(item?.price) }));
        transaction(() => {
          for (const service of services) db.prepare('INSERT INTO services VALUES (?, ?, ?, ?) ON CONFLICT(business_id, name) DO NOTHING').run(randomUUID(), user.id, service.name, service.cents);
        });
        return send(res, 200, { ok: true });
      }
      if (path === '/api/services' && method === 'POST') {
        if (user.role !== 'business') fail(403, 'Only business owners can manage services.');
        const body = await bodyOf(req);
        const name = text(body.name, 100, 'service name');
        const cents = money(body.price);
        const id = randomUUID();
        db.prepare('INSERT INTO services VALUES (?, ?, ?, ?)').run(id, user.id, name, cents);
        return send(res, 201, { id });
      }
      const serviceMatch = path.match(/^\/api\/services\/([\w-]+)$/);
      if (serviceMatch && ['PATCH', 'DELETE'].includes(method)) {
        if (user.role !== 'business') fail(403, 'Only business owners can manage services.');
        const service = db.prepare('SELECT * FROM services WHERE id = ? AND business_id = ?').get(serviceMatch[1], user.id);
        if (!service) fail(404, 'Service not found.');
        if (method === 'DELETE') db.prepare('DELETE FROM services WHERE id = ?').run(service.id);
        else { const body = await bodyOf(req); db.prepare('UPDATE services SET name = ?, cents = ? WHERE id = ?').run(text(body.name, 100, 'service name'), money(body.price), service.id); }
        return send(res, 200, { ok: true });
      }
      if (path === '/api/requests/guide' && method === 'POST') {
        if (user.role !== 'customer') fail(403, 'Only customers can use the request assistant.');
        const body = await bodyOf(req);
        const businessId = text(body.businessId, 100, 'business');
        const request = text(body.request, 2000, 'request description');
        if (!Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 10000) fail(400, 'Enter a valid quantity.');
        if (!db.prepare("SELECT id FROM users WHERE id = ? AND role = 'business'").get(businessId)) fail(404, 'Business not found.');
        const services = db.prepare('SELECT id, name, cents FROM services WHERE business_id = ? ORDER BY rowid LIMIT 101').all(businessId);
        if (services.length > 100) fail(400, 'This catalog is too large for an AI follow-up. You can submit without AI.');
        const service = services.find(item => item.id === body.serviceId);
        if (body.serviceId !== 'custom' && !service) fail(404, 'Service no longer available. Choose another service.');
        limit(`customer-guide:${user.id}`, 10);
        const result = await aiReview({ quote: { name: service?.name || 'Custom request', quantity: body.quantity, request }, services });
        return send(res, 200, { question: result.questions[0] || null });
      }
      const messagesMatch = path.match(/^\/api\/quotes\/([\w-]+)\/messages$/);
      if (messagesMatch && ['GET', 'POST'].includes(method)) {
        const quote = db.prepare('SELECT * FROM quotes WHERE id = ? AND (business_id = ? OR customer_id = ?)').get(messagesMatch[1], user.id, user.id);
        if (!quote) fail(404, 'Quote not found.');
        if (method === 'POST') {
          const body = await bodyOf(req);
          const message = text(body.message, 3000, 'message');
          if (db.prepare('SELECT COUNT(*) AS count FROM quote_messages WHERE quote_id = ?').get(quote.id).count >= 100) fail(409, 'This conversation has reached its 100-message limit.');
          limit(`message:${user.id}`, 30);
          transaction(() => {
            const messageId = randomUUID();
            db.prepare('INSERT INTO quote_messages VALUES (?, ?, ?, ?, ?)').run(messageId, quote.id, user.id, message, now());
            engagement.quoteEvent(quote.id, `message:${messageId}`, user.role === 'business' ? 'The business sent you a message' : 'A customer replied to your request', user.role === 'business' ? 'customer' : 'business');
          });
        }
        const messages = db.prepare(`SELECT m.id, m.body, m.created, u.role AS role, u.name AS senderName FROM quote_messages m JOIN users u ON u.id = m.sender_id WHERE m.quote_id = ? ORDER BY m.created, m.rowid`).all(quote.id);
        return send(res, 200, { messages });
      }
      const reviewMatch = path.match(/^\/api\/quotes\/([\w-]+)\/review$/);
      if (reviewMatch && ['GET', 'POST', 'PATCH'].includes(method)) {
        if (user.role !== 'business') fail(403, 'Only business owners can review requests with AI.');
        const quote = db.prepare('SELECT * FROM quotes WHERE id = ? AND business_id = ?').get(reviewMatch[1], user.id);
        if (!quote) fail(404, 'Quote not found.');
        const saved = db.prepare('SELECT review, created FROM quote_reviews WHERE quote_id = ?').get(quote.id);
        if (method === 'GET') return send(res, 200, { review: saved ? { ...JSON.parse(saved.review), created: saved.created } : null });
        if (method === 'PATCH') {
          const body = await bodyOf(req);
          if (!saved) fail(404, 'Generate an AI review first.');
          const review = { ...JSON.parse(saved.review), reply: text(body.reply, 3000, 'reply') };
          db.prepare('UPDATE quote_reviews SET review = ? WHERE quote_id = ?').run(JSON.stringify(review), quote.id);
          return send(res, 200, { review: { ...review, created: saved.created } });
        }
        // Repeated clicks return the saved review without another billable call.
        if (saved) return send(res, 200, { review: { ...JSON.parse(saved.review), created: saved.created } });
        if (quote.status !== 'pending') fail(409, 'AI review is available for pending requests.');
        if (reviewing.has(quote.id)) fail(409, 'This request is already being reviewed. Try again shortly.');
        const services = db.prepare('SELECT id, name, cents FROM services WHERE business_id = ? ORDER BY rowid LIMIT 101').all(user.id);
        if (services.length > 100) fail(400, 'AI review supports up to 100 catalog services. Review this request yourself.');
        limit(`ai-review:${user.id}`, 10);
        reviewing.add(quote.id);
        try {
          const review = await aiReview({ quote: { name: quote.name, quantity: quote.quantity, request: quote.request }, services });
          if (db.prepare('SELECT status FROM quotes WHERE id = ?').get(quote.id)?.status !== 'pending') fail(409, 'This quote changed during AI review. Refresh to see its current status.');
          const created = now();
          db.prepare('INSERT INTO quote_reviews VALUES (?, ?, ?)').run(quote.id, JSON.stringify(review), created);
          return send(res, 200, { review: { ...review, created } });
        } finally { reviewing.delete(quote.id); }
      }
      if (path === '/api/quotes' && method === 'POST') {
        if (user.role !== 'customer') fail(403, 'Only customers can request quotes.');
        const body = await bodyOf(req);
        const businessId = text(body.businessId, 100, 'business');
        if (!db.prepare("SELECT id FROM users WHERE id = ? AND role = 'business'").get(businessId)) fail(404, 'Business not found.');
        if (!Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 10000) fail(400, 'Enter a whole-number quantity from 1 to 10,000.');
        if (typeof body.request !== 'string' || body.request.length > 2000) fail(400, 'Request details must be at most 2,000 characters.');
        const custom = body.serviceId === 'custom';
        const service = custom ? null : db.prepare('SELECT * FROM services WHERE id = ? AND business_id = ?').get(text(body.serviceId, 100, 'service'), businessId);
        if (!custom && !service) fail(404, 'This service is no longer available.');
        if (custom && !body.request.trim()) fail(400, 'Describe your custom request.');
        const id = randomUUID();
        // Prices and ownership always come from the server, never client totals or roles.
        transaction(() => {
          db.prepare('INSERT INTO quotes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, businessId, user.id, custom ? 'Custom request' : service.name, body.request.trim(), body.quantity, service?.cents ?? null, 'pending', now());
          engagement.quoteEvent(id, `new:${id}`, 'New quote request', 'business');
          engagement.quoteEvent(id, `received:${id}`, 'Your request was received', 'customer');
        });
        return send(res, 201, { id });
      }
      const quoteMatch = path.match(/^\/api\/quotes\/([\w-]+)$/);
      if (quoteMatch && method === 'PATCH') {
        const body = await bodyOf(req);
        const quote = db.prepare(`SELECT * FROM quotes WHERE id = ? AND ${user.role === 'business' ? 'business_id' : 'customer_id'} = ?`).get(quoteMatch[1], user.id);
        if (!quote) fail(404, 'Quote not found.');
        if (user.role === 'business') {
          if (quote.status !== 'pending' || !['approved', 'rejected'].includes(body.status)) fail(409, 'Only pending requests can be approved or rejected.');
          const cents = body.status === 'approved' ? money(body.price) : quote.cents;
          transaction(() => {
            db.prepare('UPDATE quotes SET status = ?, cents = ? WHERE id = ?').run(body.status, cents, quote.id);
            engagement.quoteEvent(quote.id, `status:${quote.id}:${body.status}`, `Your quote is ${body.status}`, 'customer');
          });
        } else {
          if (quote.status !== 'approved' || !['accepted', 'declined'].includes(body.status)) fail(409, 'Only approved quotes can be accepted or declined.');
          transaction(() => {
            db.prepare('UPDATE quotes SET status = ? WHERE id = ?').run(body.status, quote.id);
            engagement.quoteEvent(quote.id, `status:${quote.id}:${body.status}`, `Customer ${body.status} the quote`, 'business');
            engagement.quoteEvent(quote.id, `confirmation:${quote.id}:${body.status}`, `Your quote is ${body.status}`, 'customer');
          });
        }
        return send(res, 200, { ok: true });
      }
      fail(404, 'Not found.');
    } catch (error) {
      const duplicate = error.code === 'ERR_SQLITE_ERROR' && error.message.includes('UNIQUE constraint failed');
      const status = error.status ?? (duplicate ? 409 : 500);
      if (status === 500) console.error('API failure:', error.message);
      if (!res.headersSent) send(res, status, { error: duplicate ? 'This name is already in use.' : status === 500 ? 'Something went wrong. Please try again.' : error.message });
      else res.end();
    }
  }
  return { handle, flushMail: engagement.flushMail, frameAncestors: engagement.frameAncestors, close: () => db.close() };
}
