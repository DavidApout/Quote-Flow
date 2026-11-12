import { randomUUID } from 'node:crypto';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const root = 'https://api-m.sandbox.paypal.com';
const valueOf = cents => (cents / 100).toFixed(2);
const idValid = id => typeof id === 'string' && /^[A-Z0-9]{8,32}$/.test(id);
export function approvalUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://www.sandbox.paypal.com' && !url.username && !url.password && ['/checkoutnow', '/checkoutnow/'].includes(url.pathname)) return url.href;
  } catch { /* Reject malformed provider links. */ }
  fail(502, 'PayPal returned an unexpected checkout link.');
}

export function sandboxTransport({ clientId, secret, fetcher = fetch }) {
  let token, until = 0;
  return async (path, { method = 'GET', body, requestId } = {}) => {
    try {
      if (!token || Date.now() >= until) {
        const response = await fetcher(`${root}/v1/oauth2/token`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' });
        if (!response.ok) fail(503, 'PayPal Sandbox credentials could not be verified. Ask the business to check setup.');
        const data = await response.json();
        if (typeof data.access_token !== 'string' || !data.access_token) fail(502, 'PayPal Sandbox authentication failed.');
        token = data.access_token; until = Date.now() + Math.max(0, (Number(data.expires_in) || 0) - 60) * 1000;
      }
      const response = await fetcher(`${root}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(requestId ? { 'PayPal-Request-Id': requestId } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (response.status === 401) { token = null; until = 0; }
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        const code = problem.details?.[0]?.issue || problem.name;
        const safeCode = typeof code === 'string' && /^[A-Z_]{3,80}$/.test(code) ? ` (${code})` : '';
        fail(502, `PayPal could not complete this step${safeCode}. Check payment status before trying again.`);
      }
      return await response.json();
    } catch (error) {
      if (error.status) throw error;
      fail(502, 'PayPal Sandbox did not respond. Retry to check the same payment safely.');
    }
  };
}

export function createPayments({ db, origin, now, transaction, quoteEvent, config = {}, transport }) {
  db.exec(`CREATE TABLE IF NOT EXISTS sandbox_payments (
    quote_id TEXT PRIMARY KEY REFERENCES quotes(id), id TEXT UNIQUE NOT NULL,
    cents INTEGER NOT NULL, merchant TEXT NOT NULL, payload TEXT NOT NULL,
    created INTEGER NOT NULL, order_id TEXT UNIQUE, approval_url TEXT,
    capture_key TEXT NOT NULL, capture_started INTEGER,
    capture_id TEXT UNIQUE, paid_at INTEGER, state TEXT NOT NULL DEFAULT 'creating',
    lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0
  )`);
  const configured = !!(config.businessId && config.merchantId && ((config.clientId && config.secret) || transport));
  const remote = transport || sandboxTransport(config);
  const rowOf = quoteId => db.prepare('SELECT * FROM sandbox_payments WHERE quote_id=?').get(quoteId);
  function info(quote, customer = true) {
    const row = rowOf(quote.id);
    return { sandbox: true, available: configured && quote.business_id === config.businessId,
      state: row?.state || 'not_started', amount: row ? row.cents / 100 : quote.cents * quote.quantity / 100,
      currency: 'USD', captureId: row?.capture_id || null, paidAt: row?.paid_at || null,
      approvalUrl: customer && row?.state !== 'paid' ? row?.approval_url || null : null };
  }
  function validate(order, row) {
    const unit = order.purchase_units?.[0];
    if (order.id !== row.order_id || order.intent !== 'CAPTURE' || order.purchase_units?.length !== 1 ||
        unit?.reference_id !== row.quote_id || unit?.custom_id !== row.quote_id || unit?.invoice_id !== row.id ||
        unit?.amount?.currency_code !== 'USD' || unit?.amount?.value !== valueOf(row.cents) || unit?.payee?.merchant_id !== row.merchant) {
      fail(502, 'PayPal payment details do not match this quote. Payment has not been recorded; contact the business.');
    }
    return unit;
  }
  function record(order, row) {
    const unit = validate(order, row);
    const captures = unit.payments?.captures || [];
    if (order.status === 'COMPLETED' && captures.length === 1 && captures[0].status === 'COMPLETED') {
      const capture = captures[0];
      if (!idValid(capture.id) || capture.amount?.currency_code !== 'USD' || capture.amount?.value !== valueOf(row.cents) || capture.final_capture !== true) fail(502, 'PayPal capture did not match the full quote amount. Contact the business.');
      transaction(() => {
        const result = db.prepare("UPDATE sandbox_payments SET state='paid',capture_id=?,paid_at=? WHERE quote_id=? AND state!='paid'").run(capture.id, now(), row.quote_id);
        if (result.changes) for (const role of ['business', 'customer']) quoteEvent(row.quote_id, `sandbox-paid:${row.id}`, 'Sandbox payment confirmed · no real money', role);
      });
      return true;
    }
    if (captures.length) {
      db.prepare("UPDATE sandbox_payments SET state='pending' WHERE quote_id=?").run(row.quote_id);
      return true; // Never send another capture when one already exists, including pending/denied.
    }
    if (order.status === 'COMPLETED') fail(502, 'PayPal has not returned a verifiable capture. Contact the business.');
    return false;
  }
  async function act(quote, action) {
    if (!configured || quote.business_id !== config.businessId) fail(503, 'PayPal Sandbox is not configured for this business.');
    if (quote.status !== 'accepted') fail(409, 'Accept the approved quote before paying.');
    const cents = quote.cents * quote.quantity;
    if (!Number.isSafeInteger(cents) || cents < 1 || cents > 1000000) fail(400, 'Sandbox checkout supports totals from $0.01 to $10,000.');
    let row = rowOf(quote.id);
    if (!row && action !== 'create') fail(409, 'Start sandbox checkout first.');
    if (!row) {
      const id = randomUUID();
      const payload = { intent: 'CAPTURE', purchase_units: [{ reference_id: quote.id, custom_id: quote.id, invoice_id: id, amount: { currency_code: 'USD', value: valueOf(cents) }, payee: { merchant_id: config.merchantId }, description: 'QuoteFlow sandbox demo' }], payment_source: { paypal: { experience_context: { shipping_preference: 'NO_SHIPPING', user_action: 'PAY_NOW', return_url: `${origin}/payment-return`, cancel_url: `${origin}/payment-return?cancelled=1` } } } };
      db.prepare('INSERT OR IGNORE INTO sandbox_payments (quote_id,id,cents,merchant,payload,created,capture_key) VALUES (?,?,?,?,?,?,?)').run(quote.id, id, cents, config.merchantId, JSON.stringify(payload), now(), randomUUID());
      row = rowOf(quote.id);
    }
    if (row.cents !== cents || row.merchant !== config.merchantId) fail(409, 'Payment setup changed. Contact the business before continuing.');
    if (row.state === 'paid') return info(quote);
    const lease = randomUUID();
    if (!db.prepare('UPDATE sandbox_payments SET lease=?,lease_until=? WHERE quote_id=? AND lease_until<=?').run(lease, now() + 120000, quote.id, now()).changes) fail(409, 'Payment is being checked. Try again shortly.');
    try {
      if (!row.order_id) {
        // Bound ambiguous create retries; never silently replace a potentially approved order.
        if (now() - row.created > 60 * 60 * 1000) fail(409, 'This checkout needs manual review. Contact the business; do not create a replacement payment.');
        const order = await remote('/v2/checkout/orders', { method: 'POST', requestId: row.id, body: JSON.parse(row.payload) });
        if (!idValid(order.id)) fail(502, 'PayPal returned an invalid order.');
        const link = order.links?.find(link => ['payer-action', 'approve'].includes(link.rel));
        const url = approvalUrl(link?.href);
        if (new URL(url).searchParams.get('token') !== order.id) fail(502, 'PayPal returned a mismatched checkout link.');
        db.prepare("UPDATE sandbox_payments SET order_id=?,approval_url=?,state='created' WHERE quote_id=?").run(order.id, url, quote.id);
        row = rowOf(quote.id);
      }
      if (action === 'capture' || action === 'check') {
        const order = await remote(`/v2/checkout/orders/${row.order_id}`);
        if (!record(order, row) && action === 'capture') {
          if (order.status !== 'APPROVED') fail(409, 'Approve the payment in the PayPal Sandbox tab first, then return here.');
          if (row.capture_started !== null && now() - row.capture_started > 60 * 60 * 1000) fail(409, 'This payment needs manual review. Its status can still be checked safely.');
          db.prepare('UPDATE sandbox_payments SET capture_started=COALESCE(capture_started,?) WHERE quote_id=?').run(now(), quote.id);
          await remote(`/v2/checkout/orders/${row.order_id}/capture`, { method: 'POST', requestId: row.capture_key, body: {} });
          // Read authoritative order details instead of relying on redirect or client-supplied data.
          const result = await remote(`/v2/checkout/orders/${row.order_id}`);
          if (!record(result, row)) fail(502, 'Payment is not confirmed yet. Check status again shortly.');
        }
      }
      return info(quote);
    } finally { db.prepare('UPDATE sandbox_payments SET lease=NULL,lease_until=0 WHERE quote_id=? AND lease=?').run(quote.id, lease); }
  }
  return { info, act };
}
