import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { readSaved } from './lib/storage';
import { api } from './lib/api';
import AccountForm, { RecoveryCode } from './components/AccountForm';
import QuoteCard from './components/QuoteCard';
import QuoteForm from './components/QuoteForm';
import ServiceEditor from './components/ServiceEditor';
import RequestDiscussion from './components/RequestDiscussion';
import CustomerAssistant from './components/CustomerAssistant';

function Review({ quote, onUpdate, busy }) {
  const [price, setPrice] = useState(String(quote.price ?? ''));
  return <form onSubmit={event => { event.preventDefault(); const amount = Number(price); if (price.trim() && Number.isFinite(amount) && amount >= 0 && amount <= 1000000) onUpdate({ price: Math.round(amount * 100) / 100, status: 'approved' }); }}><fieldset disabled={busy}><label htmlFor={`price-${quote.id}`}>Final unit price (USD)</label><input id={`price-${quote.id}`} type="number" min="0" max="1000000" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} /><p className="muted">Final total: {price.trim() && Number.isFinite(Number(price)) ? `$${(Math.round(Number(price) * 100) * quote.quantity / 100).toFixed(2)}` : 'Enter a price'} · {quote.quantity} units</p><div className="actions"><button>Approve quote</button><button type="button" className="secondary" onClick={() => onUpdate({ status: 'rejected' })}>Reject</button></div></fieldset></form>;
}

function Workspace({ user, onSessionExpired }) {
  const [data, setData] = useState(null);
  const [businessId, setBusinessId] = useState(() => new URLSearchParams(window.location.search).get('business') || '');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [request, setRequest] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const pending = useRef(false);
  const business = user.role === 'business';
  const [view, setView] = useState('dashboard');
  const [filter, setFilter] = useState('all');
  const [customerMode, setCustomerMode] = useState('guided');
  const [search, setSearch] = useState('');
  const visibleQuotes = [...(data?.quotes || [])].reverse().filter(item =>
    (filter === 'all' || item.status === filter) &&
    `${item.name} ${item.customerName} ${item.request}`.toLowerCase().includes(search.toLowerCase()));
  const customerUrl = `${window.location.origin}/request?business=${encodeURIComponent(user.id)}`;

  const [legacyServices, setLegacyServices] = useState(() => {
    try { return readSaved(localStorage, 'quoteflow-services', []).slice(0, 100); } catch { return []; }
  });
  const handleError = useCallback(error => { if (error.status === 401) onSessionExpired(); else setError(error.message); }, [onSessionExpired]);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    const result = await api(`/workspace?businessId=${encodeURIComponent(businessId)}`, { accountId: user.id });
    if (current === sequence.current) setData(result);
  }, [businessId, user.id]);
  useEffect(() => {
    let alive = true;
    const counter = sequence;
    const update = () => { if (!pending.current) refresh().catch(error => { if (alive) handleError(error); }); };
    update();
    const timer = setInterval(update, 15000);
    window.addEventListener('focus', update);
    return () => { alive = false; counter.current++; clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh, handleError]);
  async function mutate(path, method, body, message) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await api(path, { method, body, accountId: user.id });
      setNotice(message);
      // A refresh failure must not make a successful write look like a failed submission.
      try { await refresh(); } catch { setError('Saved successfully, but the list could not refresh. Use Refresh to try again.'); }
      return true;
    } catch (error) { handleError(error); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  function clearQuote() { setQuote(null); setError(''); setNotice(''); }
  function generate(event) {
    event.preventDefault();
    const service = data.services.find(item => item.id === selectedServiceId);
    const custom = selectedServiceId === 'custom';
    const count = Number(quantity);
    if (!Number.isSafeInteger(count) || count < 1 || count > 10000) { setError('Enter a whole-number quantity from 1 to 10,000.'); return; }
    if ((!custom && !service) || (custom && !request.trim())) { setError('Choose a service or describe your custom request.'); return; }
    setQuote({ name: custom ? 'Custom request' : service.name, request: request.trim(), quantity: count, price: custom ? null : service.price, total: custom ? null : Math.round(service.price * 100) * count / 100 });
    setError(''); setNotice('');
  }
  return <>
    <div className="section-heading workspace-heading"><div><p className="eyebrow">{business ? user.businessName : `WELCOME, ${user.name}`}</p><h2>{business ? view === 'services' ? 'Your service catalog.' : view === 'inbox' ? 'Every request. One inbox.' : 'Your business, at a glance.' : 'Let’s make something.'}</h2><p className="muted">{business ? `${data?.quotes.filter(item => item.status === 'pending').length ?? 0} requests waiting for review` : 'Choose a business and share your idea.'}</p></div><button disabled={busy} className="secondary" onClick={() => { setError(''); refresh().catch(handleError); }}>Refresh</button></div>
    {error && <p className="error feedback" role="alert">{error}</p>}<p className="notice" role="status">{notice}</p>
    {!data ? <p className="muted" role="status">{error ? 'Your workspace could not load.' : 'Loading your workspace…'}</p> : <>
      {!business && <div className="business-picker"><label htmlFor="choose-business">Business</label><select id="choose-business" disabled={busy} value={data.businessId} onChange={event => { setBusinessId(event.target.value); setData(null); setSelectedServiceId(''); setRequest(''); setQuantity(1); setCustomerMode('guided'); clearQuote(); }}><option value="" disabled>Choose a business</option>{data.businesses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
      {business && legacyServices.length > 0 && data.services.length === 0 && <div className="legacy-import"><p className="muted">There are {legacyServices.length} services saved from your earlier demo in this browser. Add them to this business account?</p><button disabled={busy} className="secondary" onClick={async () => { if (await mutate('/services/import', 'POST', { services: legacyServices }, 'Earlier services added to your account.')) setLegacyServices([]); }}>Import my earlier services</button></div>}
      {business && <>
        <nav className="view-nav" aria-label="Business workspace">{[['dashboard', 'Overview'], ['inbox', 'Request inbox'], ['services', 'Services']].map(([id, label]) => <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}{id === 'inbox' && <span className="nav-count">{data.quotes.filter(q => q.status === 'pending').length}</span>}</button>)}</nav>
        {view === 'dashboard' && <>
          <section className="dashboard-hero"><div><p className="eyebrow">FROM FIRST REQUEST TO YOUR NEXT YES</p><h2>Good work starts<br />with a clear quote.</h2><p>Bring requests, pricing, and approvals into one place.</p><button onClick={() => setView('inbox')}>Review requests ↗</button></div><div className="flow-art" aria-hidden="true"><div>01 <span>Customer request</span><b>↗</b></div><div>02 <span>Your review</span><b>✓</b></div><div>03 <span>Ready to accept</span><b>→</b></div></div></section>
          <div className="stats"><article><p>Needs review</p><strong>{data.quotes.filter(q => q.status === 'pending').length}</strong><small>Requests awaiting your decision</small></article><article><p>Approved quotes</p><strong>{data.quotes.filter(q => q.status === 'approved').length}</strong><small>Waiting for customer acceptance</small></article><article><p>Accepted value</p><strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.quotes.filter(q => q.status === 'accepted').reduce((sum, q) => sum + q.total, 0))}</strong><small>Quoted value · not collected revenue</small></article></div>
          <section className="share-panel"><div><h3>Your customer request page</h3><p className="muted">Customers sign in to submit and track their quote. Local links work on this computer only.</p><a href={customerUrl}>{customerUrl}</a></div><button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(customerUrl); setNotice('Customer link copied.'); } catch { setError('Could not copy. Select and copy the link above.'); } }}>Copy link</button></section>
        </>}
      </>}
      <div className={business ? 'business-content' : 'layout'}>
        {business ? view === 'services' && <ServiceEditor services={data.services} busy={busy} onSave={service => mutate(service.id ? `/services/${service.id}` : '/services', service.id ? 'PATCH' : 'POST', { name: service.name, price: service.price }, 'Service saved.')} onRemove={id => mutate(`/services/${id}`, 'DELETE', undefined, 'Service removed. Existing quotes are unchanged.')} /> : <section className="panel"><p className="eyebrow">01 / YOUR PROJECT</p><h2>Request a quote</h2>{!data.businessId ? <p className="muted">No businesses have joined yet. A business owner needs to create an account before you can request a quote.</p> : <>
          <div className="view-nav" aria-label="Request entry mode"><button disabled={busy} className={customerMode === 'guided' ? 'active' : ''} onClick={() => { setCustomerMode('guided'); clearQuote(); }}>Help me describe it</button><button disabled={busy} className={customerMode === 'form' ? 'active' : ''} onClick={() => setCustomerMode('form')}>Use a form</button></div>
          {customerMode === 'guided' ? <CustomerAssistant key={data.businessId} services={data.services} businessId={data.businessId} accountId={user.id} onSessionExpired={onSessionExpired} onUse={draft => { setSelectedServiceId(draft.serviceId); setQuantity(draft.quantity); setRequest(draft.request); clearQuote(); setCustomerMode('form'); setNotice('Your answers are ready. Review the form, then preview and submit.'); }} /> : <fieldset disabled={busy}><QuoteForm services={data.services} selectedServiceId={selectedServiceId} onServiceChange={value => { setSelectedServiceId(value); clearQuote(); }} request={request} setRequest={value => { setRequest(value); clearQuote(); }} quantity={quantity} setQuantity={value => { setQuantity(value); clearQuote(); }} onGenerate={generate} /></fieldset>}
          {quote && <><QuoteCard quote={quote} /><button disabled={busy} className="submit-request" onClick={async () => { if (await mutate('/quotes', 'POST', { businessId: data.businessId, serviceId: selectedServiceId, request: quote.request, quantity: quote.quantity }, 'Request sent. The business will review your quote.')) setQuote(null); }}>{busy ? 'Sending…' : 'Submit for approval'}</button></>}
        </>}</section>}
        <section className="panel" hidden={business && view === 'services'}><p className="eyebrow">{business ? 'REVIEW & APPROVE' : '02 / WHAT’S NEXT'}</p><div className="request-heading"><h2>{business ? (view === 'dashboard' ? 'Recent requests' : 'Request inbox') : 'Your requests'}</h2>{business && view === 'dashboard' && <button className="text-button" onClick={() => setView('inbox')}>View all →</button>}</div>
          {business && view === 'inbox' && <div className="inbox-tools"><div><label htmlFor="search">Search requests</label><input id="search" type="search" placeholder="Customer, service, or details" value={search} onChange={e => setSearch(e.target.value)} /></div><div><label htmlFor="status-filter">Status</label><select id="status-filter" value={filter} onChange={e => setFilter(e.target.value)}>{['all', 'pending', 'approved', 'accepted', 'rejected', 'declined'].map(status => <option key={status} value={status}>{status === 'all' ? 'All statuses' : status === 'pending' ? 'Pending review' : status}</option>)}</select></div></div>}
          {data.quotes.length > 0 && visibleQuotes.length === 0 && <p className="empty-state">No requests match your search or status filter.</p>}
          {data.quotes.length === 0 && <div className="empty-state"><span aria-hidden="true">↗</span><h3>A little space for big ideas.</h3><p className="muted">Submitted requests and their progress will appear here.</p></div>}
          {(business && view === 'dashboard' ? [...data.quotes].reverse().slice(0, 3) : visibleQuotes).map(item => <article className="request-card" key={item.id}><div className="request-heading"><h3>{item.name}</h3><span className={`status ${item.status}`}>{item.status === 'pending' ? 'Pending review' : item.status}</span></div><p className="muted">{business ? item.customerName : item.businessName}</p><p className="details muted">{item.request || 'No additional details'}</p><p className="muted request-reference">Request #{item.id.slice(0, 8)}</p><p className="request-total">{item.total === null ? 'Price to be confirmed' : `$${item.total.toFixed(2)}`} <span className="muted">· {item.quantity} units</span></p>
            <RequestDiscussion quote={item} user={user} onSessionExpired={onSessionExpired} />
            {business && item.status === 'pending' && <Review quote={item} busy={busy} onUpdate={changes => mutate(`/quotes/${item.id}`, 'PATCH', changes, changes.status === 'approved' ? 'Quote approved.' : 'Quote rejected.')} />}
            {!business && item.status === 'approved' && <div className="actions"><button disabled={busy} onClick={() => mutate(`/quotes/${item.id}`, 'PATCH', { status: 'accepted' }, 'Quote accepted.')}>Accept quote</button><button disabled={busy} className="secondary" onClick={() => mutate(`/quotes/${item.id}`, 'PATCH', { status: 'declined' }, 'Quote declined.')}>Decline</button></div>}
            {item.status === 'accepted' && <p className="muted">Quote accepted. Contact the business to arrange payment.</p>}
          </article>)}
        </section>
      </div>
    </>}
  </>;
}

export default function App() {
  const [theme, setTheme] = useState(() => { try { return readSaved(localStorage, 'quoteflow-theme', window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; } });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const customerEntry = window.location.pathname === '/request';
  const [error, setError] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('quoteflow-theme', JSON.stringify(theme)); } catch { /* Theme still works without storage. */ } }, [theme]);
  useEffect(() => {
    const controller = new AbortController();
    api('/auth/session', { signal: controller.signal }).then(result => setUser(result.user)).catch(error => { if (error.name !== 'AbortError') setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const expired = useCallback(() => { setUser(null); setRecoveryCode(''); setError('Your session ended. Please sign in again.'); }, []);
  // Other tabs must clear account-specific screens when sign-in changes.
  useEffect(() => {
    const check = () => api('/auth/session').then(result => { if (result.user?.id !== user?.id) { setUser(result.user); setRecoveryCode(''); } }).catch(() => {});
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [user?.id]);
  async function logout() {
    setSigningOut(true); setError('');
    try { await api('/auth/logout', { method: 'POST', accountId: user.id }); setUser(null); setRecoveryCode(''); }
    catch (error) { setError(error.message); }
    finally { setSigningOut(false); }
  }
  return <main><header><div><p className="eyebrow">LESS ADMIN. MORE CREATING.</p><h1>QuoteFlow<span> AI</span></h1><p className="muted">Your next project, beautifully simple.</p></div><div className="actions"><button className="secondary theme-toggle" aria-label="Dark mode" aria-pressed={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}</button>{user && <button disabled={signingOut} className="secondary" onClick={logout}>{signingOut ? 'Signing out…' : 'Sign out'}</button>}</div></header>
    {user && <div className="account-bar"><strong>{user.name}</strong><span className="status">{user.role === 'business' ? 'Business owner' : 'Customer'}</span><span className="muted">{user.email}</span></div>}
    {error && <p className="error feedback" role="alert">{error}</p>}
    {customerEntry && !user && <section className="share-panel"><div><h2>Request a quote</h2><p className="muted">Sign in or create a customer account to describe your project and track approval. Your selected business is remembered.</p></div></section>}
    {loading ? <p role="status">Opening QuoteFlow…</p> : recoveryCode ? <RecoveryCode code={recoveryCode} onDone={() => setRecoveryCode('')} /> : user ? <Workspace key={user.id} user={user} onSessionExpired={expired} /> : <AccountForm onSignedIn={result => { setUser(result.user); setRecoveryCode(result.recoveryCode || ''); setError(''); }} />}
    <footer><span>QuoteFlow AI</span><p>USD · Account data is saved on the server. AI reviews are suggestions. You control pricing and approval. PayPal checkout is not connected.</p></footer>
  </main>;
}
