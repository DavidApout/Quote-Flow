import { useEffect, useRef, useState } from 'react';

export default function PaymentPanel({ quoteId, accountId, token, business = false }) {
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const path = token ? '/api/track/payment' : `/api/quotes/${quoteId}/payment`;
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (pending.current) return;
      try {
        const response = await fetch(path, { credentials: token ? 'omit' : 'same-origin', headers: { ...(token ? { 'X-QuoteFlow-Token': token } : { 'X-QuoteFlow-User': accountId }) } });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Unable to load payment.');
        if (alive) { setPayment(data); setError(''); }
      } catch (error) { if (alive) setError(error.message); }
    };
    void refresh(); const timer = setInterval(refresh, 15000); window.addEventListener('focus', refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [path, token, accountId]);
  async function act(action) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(path, { method: 'POST', credentials: token ? 'omit' : 'same-origin', headers: { 'Content-Type': 'application/json', 'X-QuoteFlow-Request': '1', ...(token ? { 'X-QuoteFlow-Token': token } : { 'X-QuoteFlow-User': accountId }) }, body: JSON.stringify({ action }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'Unable to check payment.'); setPayment(data);
    } catch (error) { setError(error.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className={`payment-panel ${payment?.state === 'paid' ? 'payment-confirmed' : ''}`} aria-label="Sandbox payment">
    <p className="eyebrow">PAYPAL SANDBOX · TEST MONEY ONLY</p>
    <p className="legal-payment-link"><a href="/legal/demo" target="_blank" rel="noopener noreferrer">About demo payments<span className="sr-only"> (opens in a new tab)</span></a></p>
    {error && <p className="error" role="alert">{error}</p>}
    {!payment ? <p role="status">Loading payment details…</p> : payment.state === 'paid' ? <><div className="payment-success-icon" aria-hidden="true">✓</div><h3>Sandbox payment confirmed</h3><p className="payment-total">${payment.amount.toFixed(2)} USD</p><p className="muted">Test receipt: {payment.captureId}<br />{new Date(payment.paidAt).toLocaleString()} · No real money collected.</p><div className="payment-next"><strong>What happens next</strong><p>{business ? 'Use Messages & questions to confirm timing and pickup details with the customer.' : 'Use Messages & questions to agree on timing and pickup details with the business.'}</p><small>This is a demo payment, not confirmation of real fulfillment.</small></div></> : <>
      <h3>{business ? 'Awaiting sandbox payment' : 'Complete your sandbox checkout'}</h3>
      <p className="muted">{payment.available ? 'This demo uses a PayPal Sandbox buyer account. No real money changes hands.' : 'Checkout setup is pending for this business. Your accepted quote is saved; no payment has been collected.'}</p>
      {payment.available && <>
        <p className="payment-total">${payment.amount.toFixed(2)} USD</p>
        {payment.state === 'pending' && <p role="status">PayPal returned a capture that is not confirmed as completed. Check its status or contact the business.</p>}
        {!business && payment.state !== 'pending' && <>
          {!payment.approvalUrl ? <button disabled={busy} onClick={() => act('create')}>{busy ? 'Preparing…' : 'Prepare PayPal Sandbox checkout'}</button> : <><ol className="payment-steps"><li><a className="payment-link" href={payment.approvalUrl} target="_blank" rel="noopener noreferrer">Open PayPal Sandbox ↗</a> and approve with your sandbox buyer account.</li><li>Return to this tab and complete the test payment below.</li></ol><button disabled={busy} onClick={() => act('capture')}>{busy ? 'Checking with PayPal…' : 'Complete sandbox payment'}</button></>}
        </>}
        {payment.state !== 'not_started' && <button className="secondary" disabled={busy} onClick={() => act('check')}>{busy ? 'Checking…' : 'Check payment status'}</button>}
      </>}
    </>}
  </section>;
}
