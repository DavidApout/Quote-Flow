import DownloadQuote from './DownloadQuote';
import { LegalNotice } from './LegalLinks';
import JobDetails from './JobDetails';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import CustomerAssistant from './CustomerAssistant';
import AttachmentPicker from './AttachmentPicker';
import RequestAttachments from './RequestAttachments';
import QuoteForm from './QuoteForm';
import RequestProgress from './RequestProgress';
import PaymentPanel from './PaymentPanel';
import QuoteCard from './QuoteCard';
import '../App.css';

function GuestWidget({ businessId }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [mode, setMode] = useState('guided');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const key = useRef(crypto.randomUUID());
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    api(`/public/businesses/${businessId}`, { signal: controller.signal }).then(setData).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [businessId]);
  function change(field, value) { setDraft(previous => ({ ...previous, [field]: value })); setPreview(null); key.current = crypto.randomUUID(); }
  function makePreview(event) {
    event.preventDefault();
    const service = data.services.find(s => s.id === draft.serviceId);
    const quantity = Number(draft.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || (!service && draft.serviceId !== 'custom') || !draft.request.trim()) { setError('Choose a service, whole-number quantity, and describe your request.'); return; }
    setError(''); setPreview({ name: service?.name || 'Custom request', quantity, request: draft.request.trim(), price: service?.price ?? null, total: service ? Math.round(service.price * 100) * quantity / 100 : null });
  }
  async function submit(event) {
    event.preventDefault(); if (pending.current || attachmentBusy) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    pending.current = true; setBusy(true); setError('');
    try { await api('/public/requests', { method: 'POST', body: { ...values, businessId, serviceId: draft.serviceId, quantity: preview.quantity, request: preview.request, submissionKey: key.current, attachments } }); setSent(true); }
    catch (error) { setError(error.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="guest-shell"><header><div><p className="eyebrow">POWERED BY QUOTEFLOW</p><h1>{data?.business.name || 'Get a quote'}</h1><p className="muted">Tell us what you need. No account required.</p></div></header>
    {error && <p role="alert" className="error">{error}</p>}
    {!data ? <p>Loading request page…</p> : sent ? <section className="panel"><p className="eyebrow">REQUEST RECEIVED</p><h2>Thanks. Your request is saved.</h2><p>Check your email for a private link to confirm your address, view your quote, and answer questions.</p><p className="muted">Keep the link private. Delivery can take a few minutes; check your spam folder.</p>{data.mailMode === 'preview' && <p className="notice">Local demo: no email was sent. The business can open the email preview in Notifications to test your private link.</p>}</section> : <section className="panel">
      <div className="view-nav"><button disabled={busy} onClick={() => { setMode('guided'); setPreview(null); }}>Help me describe it</button><button disabled={busy} onClick={() => { setDraft(draft || { serviceId: 'custom', quantity: 1, request: '' }); setMode('form'); }}>Use a form</button></div>
      {mode === 'guided' ? <CustomerAssistant services={data.services} businessId={businessId} allowAI={false} onUse={value => { setDraft(value); setMode('form'); setPreview(null); key.current = crypto.randomUUID(); }} /> : <fieldset disabled={busy}><QuoteForm requireDetails services={data.services} selectedServiceId={draft.serviceId} onServiceChange={v => change('serviceId', v)} quantity={draft.quantity} setQuantity={v => change('quantity', v)} request={draft.request} setRequest={v => change('request', v)} onGenerate={makePreview} /></fieldset>}
      <AttachmentPicker value={attachments} disabled={busy} onBusyChange={setAttachmentBusy} onChange={files => { setAttachments(files); setPreview(null); key.current = crypto.randomUUID(); }} />
      {preview && <><QuoteCard quote={preview} /><form onSubmit={submit}><fieldset disabled={busy || attachmentBusy}><h3>Where should we send your private link?</h3><label htmlFor="guest-name">Your name</label><input id="guest-name" name="name" required maxLength={100} autoComplete="name" onChange={() => { key.current = crypto.randomUUID(); }} /><label htmlFor="guest-email">Email</label><input id="guest-email" name="email" required type="email" maxLength={254} autoComplete="email" onChange={() => { key.current = crypto.randomUUID(); }} /><div className="honeypot" aria-hidden="true"><label>Leave this blank<input name="website" tabIndex={-1} autoComplete="off" /></label></div><p className="muted">We’ll email you about this request. Prices and timing need business approval. No payment is collected.</p><LegalNotice /><button>{busy ? 'Submitting…' : 'Submit request'}</button></fieldset></form></>}
    </section>}
    {data && <details className="panel recovery-link"><summary>Already submitted? Get a new private link</summary><form onSubmit={async e => { e.preventDefault(); if (pending.current) return; const email = new FormData(e.currentTarget).get('email'); pending.current = true; setBusy(true); try { const result = await api('/public/recover-link', { method: 'POST', body: { businessId, email } }); setNotice(result.message); } catch (e) { setError(e.message); } finally { pending.current = false; setBusy(false); } }}><label htmlFor="recover-guest-email">Your email</label><input id="recover-guest-email" name="email" type="email" required /><button disabled={busy}>Email my latest request link</button></form><p role="status">{notice}</p></details>}
  </main>;
}

function PrivateRequest({ verificationOnly = false }) {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function call(path, method = 'GET', body) {
    const response = await fetch(`/api${path}`, { method, credentials: 'omit', headers: { 'X-QuoteFlow-Token': token, ...(method === 'GET' ? {} : { 'X-QuoteFlow-Request': '1', 'Content-Type': 'application/json' }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); if (!response.ok) throw Error(result.error || 'Unable to load request.'); return result;
  }
  useEffect(() => {
    if (verificationOnly) return;
    let alive = true;
    const refresh = async () => {
      if (pending.current) return;
      try { const response = await fetch('/api/track', { credentials: 'omit', headers: { 'X-QuoteFlow-Token': token } }); const result = await response.json(); if (!response.ok) throw Error(result.error); if (alive) setData(result); }
      catch (error) { if (alive) setError(error.message); }
    };
    void refresh(); const timer = setInterval(refresh, 15000); window.addEventListener('focus', refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [token, verificationOnly]);
  async function act(path, body, notice) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError('');
    try { await call(path, 'POST', body || {}); setNotice(notice); if (!verificationOnly) { try { setData(await call('/track')); } catch { setError('Saved successfully, but the page could not refresh. Reload to see the latest status.'); } } return true; }
    catch (error) { setError(error.message); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="guest-shell"><header><div><p className="eyebrow">QUOTEFLOW · PRIVATE ACCESS</p><h1>{verificationOnly ? 'Confirm your email' : data?.quote?.businessName || 'Your request'}</h1></div></header>{error && <p className="error" role="alert">{error}</p>}<p role="status">{notice}</p>
    {verificationOnly ? <section className="panel"><p>Confirm this address to receive QuoteFlow notifications.</p><button disabled={busy || !!notice} onClick={() => act('/email/confirm', { token }, 'Email confirmed. Return to your workspace to see notifications.')}>Confirm email</button></section> : data?.needsConfirmation ? <section className="panel"><h2>Confirm your email to continue</h2><p>This private link gives access to your request and messages. Keep it to yourself.</p>{data.mailMode === 'preview' && <p className="muted">Local email preview: this simulates verification, not a real mailbox check.</p>}<button disabled={busy} onClick={() => act('/track/confirm', {}, 'Email confirmed.')}>Confirm email and open request</button></section> : data?.quote ? <section className="panel"><span className={`status ${data.quote.sandboxPaid ? 'paid' : data.quote.status}`}>{data.quote.sandboxPaid ? 'Paid · Sandbox' : data.quote.status === 'pending' ? 'Pending review' : data.quote.status}</span><QuoteCard quote={data.quote} /><RequestProgress status={data.quote.status} paid={!!data.quote.sandboxPaid} /><p className="muted">Request #{data.quote.id.slice(0,8)} · Keep this link private. Refresh or revisit it for updates.</p>
      {data.notifications.some(n => !n.read_at) && <div className="notice"><p>{data.notifications.filter(n => !n.read_at).length} new updates</p><ul>{data.notifications.filter(n => !n.read_at).map(n => <li key={n.id}>{n.title}</li>)}</ul><button className="secondary" disabled={busy} onClick={() => act('/track/read', {}, 'Updates marked as read.')}>Mark updates read</button></div>}
      {data.quote.status === 'approved' && <div className="actions"><button disabled={busy} onClick={() => act('/track/status', { status: 'accepted' }, 'Quote accepted. No payment has been collected.')}>Accept quote</button><button disabled={busy} className="secondary" onClick={() => act('/track/status', { status: 'declined' }, 'Quote declined.')}>Decline quote</button></div>}
      {data.quote.status === 'accepted' && <PaymentPanel quoteId={data.quote.id} token={token} />}
      <DownloadQuote quote={data.quote} token={token} />
      <JobDetails quote={data.quote} token={token} />
      <RequestAttachments quoteId={data.quote.id} token={token} />
      <h3 className="conversation-title">Questions & replies</h3><ol className="message-list">{data.messages.map(m => <li key={m.id} className={m.role === 'customer' ? 'message-own' : ''}><p className="message-author">{m.role === 'customer' ? 'You' : 'Business'} · {new Date(m.created).toLocaleString()}</p><p className="details">{m.body}</p></li>)}</ol>{!data.messages.length && <p className="muted">No messages yet. Add a detail or ask a question.</p>}<form onSubmit={async e => { e.preventDefault(); if (await act('/track/messages', { message }, 'Reply sent to the business.')) setMessage(''); }}><label htmlFor="guest-message">Your message</label><textarea id="guest-message" value={message} required maxLength={3000} disabled={busy} onChange={e => setMessage(e.target.value)} /><button disabled={busy || !message.trim()}>Send reply</button></form>
    </section> : !error && <p>Opening your request…</p>}
  </main>;
}
export default function GuestPortal() {
  const path = window.location.pathname;
  if (path === '/verify-email') return <PrivateRequest verificationOnly />;
  if (path === '/track') return <PrivateRequest />;
  return <GuestWidget businessId={path.split('/')[2]} />;
}
