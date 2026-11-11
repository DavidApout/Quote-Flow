import { Webhook } from 'svix';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const day = 86400000;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const clean = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `Enter a valid ${label}.`);
  return value.trim();
};
const emailOf = value => {
  const email = clean(value, 254, 'email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email.');
  return email;
};
export function createEngagement({ db, attachments, origin, secure, now, limit, transaction, bodyOf, send, dummyHash,
  mailMode = secure ? 'disabled' : 'preview', mailKey = '', mailFrom = '', mailTransport, mailWebhookSecret = '' }) {
  if (!['preview', 'disabled', 'resend'].includes(mailMode)) throw Error('Invalid MAIL_MODE.');
  if (secure && mailMode === 'preview') throw Error('Email preview is local-development only.');
  if (mailMode === 'resend' && !mailTransport && (!mailKey || !mailFrom)) throw Error('Configure RESEND_API_KEY and MAIL_FROM before enabling live mail.');
  db.exec(`
    CREATE TABLE IF NOT EXISTS widget_settings (business_id TEXT PRIMARY KEY REFERENCES users(id), enabled INTEGER NOT NULL DEFAULT 0, origins TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS email_verifications (user_id TEXT PRIMARY KEY REFERENCES users(id), verified INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS email_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS guest_requests (quote_id TEXT PRIMARY KEY REFERENCES quotes(id), user_id TEXT NOT NULL REFERENCES users(id), email TEXT NOT NULL, submission_key TEXT NOT NULL, business_id TEXT NOT NULL, fingerprint TEXT NOT NULL, UNIQUE(business_id, submission_key));
    CREATE TABLE IF NOT EXISTS guest_tokens (token_hash TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), quote_id TEXT, event_key TEXT UNIQUE NOT NULL, title TEXT NOT NULL, created INTEGER NOT NULL, read_at INTEGER);
    CREATE TABLE IF NOT EXISTS mail_outbox (id TEXT PRIMARY KEY, event_key TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, first_attempt INTEGER, provider_id TEXT, error TEXT, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS delivery_events (event_id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, type TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created);
  `);
  const verified = userId => !!db.prepare('SELECT verified FROM email_verifications WHERE user_id = ?').get(userId)?.verified;
  function queue({ key, userId, email, title, body, force = false }) {
    const suppressed = db.prepare("SELECT id FROM mail_outbox WHERE email=? AND state IN ('bounced','complained') LIMIT 1").get(email);
    const state = suppressed ? 'suppressed' : mailMode === 'disabled' ? 'disabled' : !force && !verified(userId) ? 'unverified' : mailMode === 'preview' ? 'preview' : 'queued';
    db.prepare('INSERT OR IGNORE INTO mail_outbox (id,event_key,user_id,email,subject,body,state,next_at,created) VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(), key, userId, email, title, body, state, now(), now());
  }
  function guestLink(quoteId) {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO guest_tokens VALUES (?,?,?)').run(hash(token), quoteId, now() + 30 * day);
    return `${origin}/track#token=${token}`;
  }
  function notify(quoteId, recipient, event, title) {
    const key = `${event}:${recipient}`;
    if (db.prepare('SELECT id FROM notifications WHERE event_key = ?').get(key)) return;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(recipient);
    if (!user) return;
    db.prepare('INSERT INTO notifications VALUES (?,?,?,?,?,?,NULL)').run(randomUUID(), recipient, quoteId, key, title, now());
    const guest = db.prepare('SELECT * FROM guest_requests WHERE quote_id = ? AND user_id = ?').get(quoteId, recipient);
    const link = guest ? guestLink(quoteId) : `${origin}/?quote=${encodeURIComponent(quoteId)}`;
    queue({ key, userId: recipient, email: guest?.email || user.email, title, body: `${title}\n\nOpen your request securely:\n${link}\n\nSign in if asked. Do not forward private tracking links. Reply on the request page, not by email.` });
  }
  function quoteEvent(quoteId, event, title, recipientRole) {
    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId);
    notify(quoteId, recipientRole === 'business' ? quote.business_id : quote.customer_id, event, title);
  }
  function settings(businessId) { return db.prepare('SELECT * FROM widget_settings WHERE business_id = ?').get(businessId); }
  function frameAncestors(businessId) {
    const config = settings(businessId);
    return config?.enabled ? ["'self'", ...JSON.parse(config.origins)].join(' ') : "'none'";
  }
  function listMessages(quoteId) {
    return db.prepare('SELECT m.id,m.body,m.created,u.role,u.name AS senderName FROM quote_messages m JOIN users u ON u.id=m.sender_id WHERE m.quote_id=? ORDER BY m.created,m.rowid').all(quoteId);
  }
  function track(req) {
    const token = req.headers['x-quoteflow-token'];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail(401, 'This private link is invalid or expired. Request a new link.');
    const row = db.prepare('SELECT g.*,t.expires FROM guest_tokens t JOIN guest_requests g ON g.quote_id=t.quote_id WHERE t.token_hash=? AND t.expires>?').get(hash(token), now());
    if (!row) fail(401, 'This private link is invalid or expired. Request a new link.');
    return row;
  }
  async function publicRoutes(req, res, path, method) {
    const catalog = path.match(/^\/api\/public\/businesses\/([\w-]+)$/);
    if (catalog && method === 'GET') {
      const user = db.prepare("SELECT id,business_name AS name FROM users WHERE id=? AND role='business'").get(catalog[1]);
      if (!user || !settings(user.id)?.enabled) fail(404, 'This business is not accepting website requests.');
      return send(res, 200, { business: user, services: db.prepare('SELECT id,name,cents/100.0 AS price FROM services WHERE business_id=? ORDER BY rowid').all(user.id), mailMode }), true;
    }
    if (path === '/api/public/requests' && method === 'POST') {
      limit(`guest-ip:${req.socket.remoteAddress}`, 10);
      const body = await bodyOf(req, 4300000);
      if (body.website) fail(400, 'Unable to submit this request.');
      const businessId = clean(body.businessId, 100, 'business');
      if (!settings(businessId)?.enabled) fail(404, 'This business is not accepting website requests.');
      if (mailMode === 'disabled') fail(503, 'Email delivery is not configured. Please contact the business directly.');
      const email = emailOf(body.email); const name = clean(body.name, 100, 'name');
      const request = clean(body.request, 2000, 'request details');
      const key = clean(body.submissionKey, 100, 'submission key');
      if (!Number.isSafeInteger(body.quantity) || body.quantity < 1 || body.quantity > 10000) fail(400, 'Enter a whole-number quantity from 1 to 10,000.');
      const service = db.prepare('SELECT * FROM services WHERE business_id=? AND id=?').get(businessId, body.serviceId || '');
      if (body.serviceId !== 'custom' && !service) fail(404, 'Choose a currently available service.');
      const files = await attachments.prepare(body.attachments);
      const fingerprintParts = [email, name, request, body.quantity, body.serviceId];
      // Keep old no-file retry keys compatible with requests created before uploads.
      if (files.length) fingerprintParts.push(files.map(file => [file.name, file.digest]));
      const fingerprint = hash(JSON.stringify(fingerprintParts));
      const existing = db.prepare('SELECT * FROM guest_requests WHERE business_id=? AND submission_key=?').get(businessId, key);
      if (existing && existing.fingerprint !== fingerprint) fail(409, 'This submission changed. Start a new request.');
      if (existing) return send(res, 200, { received: true, mailMode }), true;
      limit(`guest-email:${email}`, 5);
      transaction(() => {
        const userId = randomUUID(); const quoteId = randomUUID();
        // Guest identity never claims or signs into an account with the submitted email.
        db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?)').run(userId, `guest-${userId}@guest.invalid`, name, 'customer', null, dummyHash, hash(randomBytes(32)));
        db.prepare('INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?)').run(quoteId, businessId, userId, service?.name || 'Custom request', request, body.quantity, service?.cents ?? null, 'pending', now());
        attachments.insert(quoteId, files);
        db.prepare('INSERT INTO guest_requests VALUES (?,?,?,?,?,?)').run(quoteId, userId, email, key, businessId, fingerprint);
        const link = guestLink(quoteId);
        queue({ key: `guest-confirm:${quoteId}`, userId, email, title: 'Confirm your email and track your request', body: `Your request has been saved. Confirm your email on the private page below to view the request and reply.\n\n${link}\n\nThis link expires in 30 days. Do not forward it. If you did not submit a request, ignore this email.`, force: true });
        quoteEvent(quoteId, `new:${quoteId}`, 'New website quote request', 'business');
      });
      return send(res, 201, { received: true, mailMode }), true;
    }
    if (path === '/api/public/recover-link' && method === 'POST') {
      limit(`recover-guest:${req.socket.remoteAddress}`, 5);
      const body = await bodyOf(req); const email = emailOf(body.email); const businessId = clean(body.businessId, 100, 'business');
      limit(`recover-guest-email:${email}`, 3);
      const guest = db.prepare('SELECT * FROM guest_requests WHERE email=? AND business_id=? ORDER BY rowid DESC LIMIT 1').get(email, businessId);
      if (guest) transaction(() => {
        queue({ key: `recover:${randomUUID()}`, userId: guest.user_id, email, title: 'Your private request link', body: `Open your most recent request:\n\n${guestLink(guest.quote_id)}\n\nDo not forward this link. It expires in 30 days.`, force: true });
      });
      return send(res, 200, { message: 'If a request matches, a private link has been queued for that email.' }), true;
    }
    if (path.startsWith('/api/track')) {
      const guest = track(req);
      if (path === '/api/track/confirm' && method === 'POST') {
        transaction(() => {
          db.prepare('INSERT INTO email_verifications VALUES (?,1) ON CONFLICT(user_id) DO UPDATE SET verified=1').run(guest.user_id);
          releaseMail(guest.user_id);
        });
        return send(res, 200, { ok: true }), true;
      }
      if (!verified(guest.user_id)) {
        if (path === '/api/track' && method === 'GET') return send(res, 200, { needsConfirmation: true, mailMode }), true;
        fail(403, 'Confirm your email using this private link first.');
      }
      const quote = db.prepare('SELECT q.id,q.name,q.request,q.quantity,q.cents/100.0 AS price,q.cents*q.quantity/100.0 AS total,q.status,EXISTS(SELECT 1 FROM sandbox_payments p WHERE p.quote_id=q.id AND p.state=\'paid\') AS sandboxPaid,b.business_name AS businessName FROM quotes q JOIN users b ON b.id=q.business_id WHERE q.id=?').get(guest.quote_id);
      if (path === '/api/track' && method === 'GET') return send(res, 200, { quote, messages: listMessages(quote.id), notifications: db.prepare('SELECT id,title,read_at FROM notifications WHERE user_id=? ORDER BY created DESC').all(guest.user_id), mailMode }), true;
      if (path === '/api/track/read' && method === 'POST') {
        db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(), guest.user_id);
        return send(res, 200, { ok: true }), true;
      }
      if (path === '/api/track/messages' && method === 'POST') {
        const body = await bodyOf(req); const message = clean(body.message, 3000, 'message');
        limit(`guest-message:${guest.user_id}`, 30);
        if (db.prepare('SELECT COUNT(*) AS n FROM quote_messages WHERE quote_id=?').get(quote.id).n >= 100) fail(409, 'Conversation limit reached.');
        transaction(() => {
          const id = randomUUID();
          db.prepare('INSERT INTO quote_messages VALUES (?,?,?,?,?)').run(id, quote.id, guest.user_id, message, now());
          quoteEvent(quote.id, `message:${id}`, 'Customer replied to your request', 'business');
        });
        return send(res, 201, { messages: listMessages(quote.id) }), true;
      }
      if (path === '/api/track/status' && method === 'POST') {
        const body = await bodyOf(req);
        if (!['accepted','declined'].includes(body.status) || quote.status !== 'approved') fail(409, 'Only approved quotes can be accepted or declined.');
        transaction(() => {
          db.prepare('UPDATE quotes SET status=? WHERE id=?').run(body.status, quote.id);
          quoteEvent(quote.id, `status:${quote.id}:${body.status}`, `Customer ${body.status} the quote`, 'business');
          quoteEvent(quote.id, `confirmation:${quote.id}:${body.status}`, `Your quote is ${body.status}`, 'customer');
        });
        return send(res, 200, { ok: true }), true;
      }
      fail(404, 'Not found.');
    }
    if (path === '/api/email/confirm' && method === 'POST') {
      limit(`verify:${req.socket.remoteAddress}`, 20);
      const body = await bodyOf(req); const token = clean(body.token, 100, 'verification link');
      const row = db.prepare('SELECT * FROM email_tokens WHERE token_hash=? AND expires>?').get(hash(token), now());
      if (!row) fail(400, 'Verification link is invalid or expired. Request another from your notifications panel.');
      transaction(() => {
        db.prepare('INSERT INTO email_verifications VALUES (?,1) ON CONFLICT(user_id) DO UPDATE SET verified=1').run(row.user_id);
        db.prepare('DELETE FROM email_tokens WHERE user_id=?').run(row.user_id);
        releaseMail(row.user_id);
      });
      return send(res, 200, { ok: true, mailMode }), true;
    }
    return false;
  }
  function releaseMail(userId) {
    if (mailMode !== 'disabled') db.prepare("UPDATE mail_outbox SET state=?,next_at=? WHERE user_id=? AND state='unverified'").run(mailMode === 'preview' ? 'preview' : 'queued', now(), userId);
  }
  async function accountRoutes(req, res, path, method, user) {
    if (path === '/api/widget-settings' && user.role === 'business') {
      if (method === 'POST') {
        const body = await bodyOf(req);
        if (typeof body.enabled !== 'boolean' || !Array.isArray(body.origins) || body.origins.length > 5) fail(400, 'Provide up to five website origins.');
        const origins = [...new Set(body.origins.map(value => {
          let url; try { url = new URL(value); } catch { fail(400, 'Use complete website origins such as https://example.com.'); }
          if (url.username || url.password || url.origin !== value || !['https:', ...(secure ? [] : ['http:'])].includes(url.protocol)) fail(400, 'Use a website origin without a path or trailing slash; production requires HTTPS.');
          return url.origin;
        }))];
        if (body.enabled && mailMode === 'disabled') fail(400, 'Configure email delivery before enabling the widget.');
        if (body.enabled && secure && !verified(user.id)) fail(400, 'Verify your business email before enabling the widget.');
        db.prepare('INSERT INTO widget_settings VALUES (?,?,?) ON CONFLICT(business_id) DO UPDATE SET enabled=excluded.enabled,origins=excluded.origins').run(user.id, Number(body.enabled), JSON.stringify(origins));
      } else if (method !== 'GET') return false;
      const config = settings(user.id);
      return send(res, 200, { enabled: !!config?.enabled, origins: config ? JSON.parse(config.origins) : [], url: `${origin}/widget/${user.id}`, mailMode }), true;
    }
    if (path === '/api/notifications' && method === 'GET') {
      const notifications = db.prepare('SELECT id,quote_id AS quoteId,title,created,read_at AS readAt FROM notifications WHERE user_id=? ORDER BY created DESC,rowid DESC LIMIT 100').all(user.id);
      const mail = user.role === 'business'
        ? db.prepare('SELECT id,email,subject,state,attempts,error,created FROM mail_outbox WHERE user_id=? OR user_id IN (SELECT g.user_id FROM guest_requests g WHERE g.business_id=?) ORDER BY created DESC,rowid DESC LIMIT 100').all(user.id, user.id)
        : db.prepare('SELECT id,email,subject,state,attempts,error,created FROM mail_outbox WHERE user_id=? ORDER BY created DESC,rowid DESC LIMIT 100').all(user.id);
      return send(res, 200, { notifications, mail, verified: verified(user.id), mailMode }), true;
    }
    if (path === '/api/notifications/read' && method === 'POST') {
      const body = await bodyOf(req);
      if (body.id) db.prepare('UPDATE notifications SET read_at=? WHERE id=? AND user_id=?').run(now(), body.id, user.id);
      else db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(), user.id);
      return send(res, 200, { ok: true }), true;
    }
    if (path === '/api/email/verify' && method === 'POST') {
      limit(`email-verify:${user.id}`, 3);
      transaction(() => {
        const token = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO email_tokens VALUES (?,?,?)').run(hash(token), user.id, now() + day);
        queue({ key: `verify:${randomUUID()}`, userId: user.id, email: user.email, title: 'Verify your QuoteFlow email', body: `Confirm your email to receive quote notifications:\n\n${origin}/verify-email#token=${token}\n\nThis link expires in 24 hours.`, force: true });
      });
      return send(res, 200, { ok: true, mailMode }), true;
    }
    const preview = path.match(/^\/api\/mail\/([\w-]+)\/preview$/);
    if (preview && method === 'GET') {
      if (secure || mailMode !== 'preview') fail(404, 'Preview unavailable.');
      const row = db.prepare('SELECT * FROM mail_outbox WHERE id=?').get(preview[1]);
      const ownGuest = row && user.role === 'business' && db.prepare('SELECT quote_id FROM guest_requests WHERE user_id=? AND business_id=?').get(row.user_id, user.id);
      if (!row || (row.user_id !== user.id && !ownGuest)) fail(404, 'Not found.');
      return send(res, 200, { email: row.email, subject: row.subject, body: row.body }), true;
    }
    return false;
  }
  function applyDelivery(providerId) {
    const events = db.prepare('SELECT type FROM delivery_events WHERE provider_id=?').all(providerId).map(e => e.type);
    const state = events.includes('email.complained') ? 'complained' : events.includes('email.bounced') ? 'bounced' : events.includes('email.delivered') ? 'delivered' : null;
    if (state) db.prepare('UPDATE mail_outbox SET state=?,error=? WHERE provider_id=?').run(state, ['bounced','complained'].includes(state) ? 'Delivery failed or recipient reported spam. Check the address and provider logs.' : null, providerId);
  }
  async function webhook(req, res) {
    if (!mailWebhookSecret || req.method !== 'POST') fail(404, 'Not found.');
    let raw = '';
    for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 65536) fail(413, 'Webhook too large.'); }
    let event;
    try { new Webhook(mailWebhookSecret).verify(raw, { 'svix-id': req.headers['svix-id'], 'svix-timestamp': req.headers['svix-timestamp'], 'svix-signature': req.headers['svix-signature'] }); event = JSON.parse(raw); if (!event || typeof event !== 'object') throw Error(); }
    catch { fail(400, 'Invalid webhook signature.'); }
    if (['email.delivered','email.bounced','email.complained'].includes(event.type) && typeof event.data?.email_id === 'string') {
      transaction(() => {
        db.prepare('INSERT OR IGNORE INTO delivery_events VALUES (?,?,?)').run(req.headers['svix-id'], event.data.email_id, event.type);
        applyDelivery(event.data.email_id);
      });
    }
    send(res, 200, { ok: true });
  }
  let flushing = false;
  async function flushMail() {
    if (flushing || mailMode !== 'resend') return;
    flushing = true;
    try {
      // Recover interrupted sends within the provider's 24-hour idempotency window.
      db.prepare("UPDATE mail_outbox SET state='queued' WHERE state='sending' AND next_at<=?").run(now());
      for (const row of db.prepare("SELECT * FROM mail_outbox WHERE state='queued' AND next_at<=? ORDER BY created LIMIT 10").all(now())) {
        if (row.first_attempt !== null && now() - row.first_attempt >= 23 * 3600000) {
          db.prepare("UPDATE mail_outbox SET state='failed',error='Delivery uncertain after retry window; inspect provider logs before resending.' WHERE id=?").run(row.id); continue;
        }
        const claim = db.prepare("UPDATE mail_outbox SET state='sending',attempts=attempts+1,first_attempt=COALESCE(first_attempt,?),next_at=? WHERE id=? AND state='queued'").run(now(), now() + 60000, row.id);
        if (!claim.changes) continue;
        try {
          let providerId;
          if (mailTransport) providerId = await mailTransport({ id: row.id, to: row.email, subject: row.subject, text: row.body });
          else {
            const response = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${mailKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': row.id }, body: JSON.stringify({ from: mailFrom, to: [row.email], subject: row.subject, text: row.body }) });
            if (!response.ok) throw Error(`Email provider returned HTTP ${response.status}.`);
            providerId = (await response.json()).id;
          }
          if (!providerId) throw Error('Email provider did not confirm acceptance.');
          db.prepare("UPDATE mail_outbox SET state='sent',provider_id=?,error=NULL,body='' WHERE id=?").run(providerId, row.id);
          applyDelivery(providerId);
        } catch {
          const attempts = row.attempts + 1;
          db.prepare('UPDATE mail_outbox SET state=?,error=?,next_at=? WHERE id=?').run(attempts >= 5 ? 'failed' : 'queued', 'Email delivery attempt failed. Check provider configuration or logs.', now() + 30000 * 2 ** attempts, row.id);
        }
      }
    } finally { flushing = false; }
  }
  function authorizeGuest(req) {
    const guest = track(req);
    if (!verified(guest.user_id)) fail(403, 'Confirm your email before checkout.');
    return guest;
  }
  return { authorizeGuest, publicRoutes, accountRoutes, quoteEvent, frameAncestors, flushMail, webhook };
}
