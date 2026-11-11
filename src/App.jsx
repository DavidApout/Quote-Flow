import DownloadQuote from './components/DownloadQuote';
import { LegalNotice } from './components/LegalLinks';
import JobDetails from './components/JobDetails';
import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import './workspace.css';
import Icon from './components/Icon';
import { readSaved } from './lib/storage';
import { api } from './lib/api';
import AccountForm, { RecoveryCode } from './components/AccountForm';
import RequestProgress from './components/RequestProgress';
import PaymentPanel from './components/PaymentPanel';
import QuoteCard from './components/QuoteCard';
import AttachmentPicker from './components/AttachmentPicker';
import RequestAttachments from './components/RequestAttachments';
import QuoteForm from './components/QuoteForm';
import ServiceEditor from './components/ServiceEditor';
import RequestDiscussion from './components/RequestDiscussion';
import CustomerAssistant from './components/CustomerAssistant';
import NotificationCenter from './components/NotificationCenter';
import ProfileCard from './components/ProfileCard';
import QuoteRating from './components/QuoteRating';
import SettingsPage from './components/SettingsPage';
import WidgetSettings from './components/WidgetSettings';

function Review({ quote, onUpdate, busy }) {
  const [price, setPrice] = useState(String(quote.price ?? ''));
  return <form onSubmit={event => { event.preventDefault(); const amount = Number(price); if (price.trim() && Number.isFinite(amount) && amount >= 0 && amount <= 1000000) onUpdate({ price: Math.round(amount * 100) / 100, status: 'approved' }); }}><fieldset disabled={busy}><label htmlFor={`price-${quote.id}`}>Final unit price (USD)</label><input id={`price-${quote.id}`} type="number" min="0" max="1000000" step="0.01" required value={price} onChange={event => setPrice(event.target.value)} /><p className="muted">Final total: {price.trim() && Number.isFinite(Number(price)) ? `$${(Math.round(Number(price) * 100) * quote.quantity / 100).toFixed(2)}` : 'Enter a price'} · {quote.quantity} units</p><div className="actions"><button>Approve quote</button><button type="button" className="secondary" onClick={() => onUpdate({ status: 'rejected' })}>Reject</button></div></fieldset></form>;
}

function Workspace({ user, onSessionExpired }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [data, setData] = useState(null);
  const [businessId, setBusinessId] = useState(() => new URLSearchParams(window.location.search).get('business') || '');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [request, setRequest] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [quote, setQuote] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const pending = useRef(false);
  const business = user.role === 'business';
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).has('quote') ? 'inbox' : 'dashboard');
  const [focusedQuote, setFocusedQuote] = useState(() => new URLSearchParams(window.location.search).get('quote') || '');
  const [filter, setFilter] = useState('all');
  const [customerMode, setCustomerMode] = useState('guided');
  const [search, setSearch] = useState('');
  const visibleQuotes = [...(data?.quotes || [])].reverse().filter(item =>
    (!focusedQuote || item.id === focusedQuote) && (filter === 'all' || (filter === 'paid' ? !!item.sandboxPaid : filter === 'unpaid' ? item.status === 'accepted' && !item.sandboxPaid : item.status === filter)) &&
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
  if (settingsOpen) return <SettingsPage user={user} onSessionExpired={onSessionExpired} onBack={() => setSettingsOpen(false)} onOpenRequest={id => { setSettingsOpen(false); setView('inbox'); setFocusedQuote(id || ''); setSearch(''); setFilter('all'); refresh().catch(handleError); }} />;
  return <>
    <div className="section-heading workspace-heading"><div><p className="eyebrow">{business ? user.businessName : `WELCOME, ${user.name}`}</p><h2>{business ? view === 'services' ? 'Services' : view === 'inbox' ? 'Requests' : view === 'widget' ? 'Website widget' : 'Overview' : 'Your next project.'}</h2><p className="muted">{business ? `${data?.quotes.filter(item => item.status === 'pending').length ?? 0} requests waiting for review` : 'Choose a business and share your idea.'}</p></div><div className="workspace-tools"><button className="secondary" onClick={() => setSettingsOpen(true)}><Icon name="settings" />Settings</button><button disabled={busy} className="secondary" onClick={() => { setError(''); refresh().catch(handleError); }}><Icon name="refresh" />Refresh</button></div></div>
    {error && <p className="error feedback" role="alert">{error}</p>}<p className="notice" role="status">{notice}</p>
    <NotificationCenter user={user} onSessionExpired={onSessionExpired} onOpen={id => { setView('inbox'); setFocusedQuote(id || ''); setSearch(''); setFilter('all'); refresh().catch(handleError); }} />
    {focusedQuote && <button className="text-button" onClick={() => setFocusedQuote('')}>Show all requests</button>}
    {!data ? <p className="muted" role="status">{error ? 'Your workspace could not load.' : 'Loading your workspace…'}</p> : <>
      {!business && <div className="business-picker"><label htmlFor="choose-business">Business</label><select id="choose-business" disabled={busy || attachmentBusy} value={data.businessId} onChange={event => { setBusinessId(event.target.value); setAttachments([]); setQuote(null); setData(null); setSelectedServiceId(''); setRequest(''); setQuantity(1); setCustomerMode('guided'); clearQuote(); }}><option value="" disabled>Choose a business</option>{data.businesses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
      {!business && data.businessId && <div className="business-identity"><ProfileCard key={data.businessId} profileId={data.businessId} accountId={user.id} /></div>}
      {business && legacyServices.length > 0 && data.services.length === 0 && <div className="legacy-import"><p className="muted">There are {legacyServices.length} services saved from your earlier demo in this browser. Add them to this business account?</p><button disabled={busy} className="secondary" onClick={async () => { if (await mutate('/services/import', 'POST', { services: legacyServices }, 'Earlier services added to your account.')) setLegacyServices([]); }}>Import my earlier services</button></div>}
      {business && <>
        <nav className="view-nav" aria-label="Business workspace">{[['dashboard', 'Overview'], ['inbox', 'Request inbox'], ['services', 'Services'], ['widget', 'Website widget']].map(([id, label]) => <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>{label}{id === 'inbox' && <span className="nav-count">{data.quotes.filter(q => q.status === 'pending').length}</span>}</button>)}</nav>
        {view === 'dashboard' && <>
          <div className="stats dashboard-stats">{[
            { label: 'Needs review', value: data.quotes.filter(q => q.status === 'pending').length, detail: 'Requests awaiting your decision', filter: 'pending', icon: '↗' },
            { label: 'Awaiting acceptance', value: data.quotes.filter(q => q.status === 'approved').length, detail: 'Approved quotes with the customer', filter: 'approved', icon: '→' },
            { label: 'Awaiting payment', value: data.quotes.filter(q => q.status === 'accepted' && !q.sandboxPaid).length, detail: 'Accepted · no confirmed sandbox payment', filter: 'unpaid', icon: '◷' },
            { label: 'Sandbox payments', value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.quotes.filter(q => q.sandboxPaid).reduce((sum, q) => sum + q.total, 0)), detail: `${data.quotes.filter(q => q.sandboxPaid).length} confirmed · test money only`, filter: 'paid', icon: '✓' },
          ].map(card => <button key={card.filter} className={`metric-card metric-${card.filter}`} onClick={() => { setFilter(card.filter); setFocusedQuote(''); setSearch(''); setView('inbox'); }}><span className="metric-top"><span>{card.label}</span></span><strong>{card.value}</strong><small>{card.detail}</small><span className="metric-link">View requests <span aria-hidden="true">↗</span></span></button>)}</div>
          <section className="share-panel"><div><h3>Your request page</h3><p className="muted">Share this page with customers. Local demo links work on this computer only. For no-account requests, use Website widget.</p><a href={customerUrl}>{customerUrl}</a></div><button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(customerUrl); setNotice('Customer link copied.'); } catch { setError('Could not copy. Select and copy the link above.'); } }}>Copy link</button></section>
        </>}
      </>}
      {business && view === 'widget' && <WidgetSettings accountId={user.id} />}
      <div className={business ? 'business-content' : 'layout customer-layout'}>
        {business ? view === 'services' && <ServiceEditor services={data.services} busy={busy} onSave={service => mutate(service.id ? `/services/${service.id}` : '/services', service.id ? 'PATCH' : 'POST', { name: service.name, price: service.price }, 'Service saved.')} onRemove={id => mutate(`/services/${id}`, 'DELETE', undefined, 'Service removed. Existing quotes are unchanged.')} /> : <section className="panel compose-panel"><h2>Request a quote</h2>{!data.businessId ? <p className="muted">No businesses have joined yet. A business owner needs to create an account before you can request a quote.</p> : <>
          <div className="view-nav" aria-label="Request entry mode"><button disabled={busy} className={customerMode === 'guided' ? 'active' : ''} onClick={() => { setCustomerMode('guided'); clearQuote(); }}>Help me describe it</button><button disabled={busy} className={customerMode === 'form' ? 'active' : ''} onClick={() => setCustomerMode('form')}>Use a form</button></div>
          {customerMode === 'guided' ? <CustomerAssistant key={data.businessId} services={data.services} businessId={data.businessId} accountId={user.id} onSessionExpired={onSessionExpired} onUse={draft => { setSelectedServiceId(draft.serviceId); setQuantity(draft.quantity); setRequest(draft.request); clearQuote(); setCustomerMode('form'); setNotice('Your answers are ready. Review the form, then preview and submit.'); }} /> : <fieldset disabled={busy}><QuoteForm services={data.services} selectedServiceId={selectedServiceId} onServiceChange={value => { setSelectedServiceId(value); clearQuote(); }} request={request} setRequest={value => { setRequest(value); clearQuote(); }} quantity={quantity} setQuantity={value => { setQuantity(value); clearQuote(); }} onGenerate={generate} /></fieldset>}
          <AttachmentPicker key={`attachments:${data.businessId}`} value={attachments} disabled={busy} onBusyChange={setAttachmentBusy} onChange={files => { setAttachments(files); clearQuote(); }} />
          {quote && <><QuoteCard quote={quote} /><LegalNotice /><button disabled={busy || attachmentBusy} className="submit-request" onClick={async () => { if (await mutate('/quotes', 'POST', { businessId: data.businessId, serviceId: selectedServiceId, request: quote.request, quantity: quote.quantity, attachments }, 'Request sent. The business will review your quote.')) { setQuote(null); setAttachments([]); } }}>{busy ? 'Sending…' : 'Submit for approval'}</button></>}
        </>}</section>}
        <section className={`panel requests-panel ${business && view === 'dashboard' ? 'dashboard-requests' : ''}`} hidden={business && ['services', 'widget'].includes(view)}><div className="request-heading"><h2>{business ? (view === 'dashboard' ? 'Recent requests' : 'Request inbox') : 'Your requests'}</h2>{business && view === 'dashboard' && <button className="text-button" onClick={() => setView('inbox')}>View all →</button>}</div>
          {business && view === 'inbox' && <div className="inbox-tools"><div><label htmlFor="search">Search requests</label><input id="search" type="search" placeholder="Customer, service, or details" value={search} onChange={e => setSearch(e.target.value)} /></div><div><label htmlFor="status-filter">Status</label><select id="status-filter" value={filter} onChange={e => setFilter(e.target.value)}>{['all', 'pending', 'approved', 'accepted', 'unpaid', 'paid', 'rejected', 'declined'].map(status => <option key={status} value={status}>{status === 'all' ? 'All statuses' : status === 'pending' ? 'Pending review' : status === 'unpaid' ? 'Awaiting payment' : status === 'paid' ? 'Paid · Sandbox' : status}</option>)}</select></div></div>}
          {data.quotes.length > 0 && visibleQuotes.length === 0 && <p className="empty-state">No requests match your search or status filter.</p>}
          {data.quotes.length === 0 && <div className="empty-state"><span aria-hidden="true">↗</span><h3>A little space for big ideas.</h3><p className="muted">Submitted requests and their progress will appear here.</p></div>}
          <div className="request-list">{(business && view === 'dashboard' ? [...data.quotes].reverse().slice(0, 3) : visibleQuotes).map(item => <article className="request-card" key={item.id}>
            <div className="request-heading"><div className="request-title"><div><h3>{item.name}</h3><p className="muted">{business ? item.customerName : item.businessName}</p></div></div><span className={`status ${item.sandboxPaid ? 'paid' : item.status}`}>{item.sandboxPaid ? 'Paid · Sandbox' : item.status === 'pending' ? 'Pending review' : item.status}</span></div>
            <p className="details muted">{item.request || 'No additional details'}</p>
            <div className="request-meta"><p className="muted request-reference">REQUEST #{item.id.slice(0, 8)}</p><p className="request-total">{item.total === null ? 'Price to be confirmed' : `$${item.total.toFixed(2)}`} <span className="muted">/ {item.quantity} units</span></p></div>
            <RequestProgress status={item.status} paid={!!item.sandboxPaid} />
            <details className="request-workspace" open={focusedQuote === item.id}><summary><span>{business && item.status === 'pending' ? 'Review this request' : !business && item.status === 'accepted' && !item.sandboxPaid ? 'View checkout & details' : !business && item.status === 'approved' ? 'Review approved quote' : 'View request details'}<small>Files, messages & job updates</small></span><Icon name="arrow" /></summary><div className="request-workspace-body">
            <details className="participant-profile"><summary>View {business ? 'customer' : 'business'} profile</summary><ProfileCard profileId={business ? item.customerId : item.businessId} accountId={user.id} compact /></details>
            {item.status === 'accepted' && <QuoteRating quoteId={item.id} accountId={user.id} business={business} />}
            <DownloadQuote quote={item} accountId={user.id} />
            <JobDetails quote={item} accountId={user.id} business={business} />
            <RequestAttachments quoteId={item.id} accountId={user.id} />
            <RequestDiscussion quote={item} user={user} onSessionExpired={onSessionExpired} />
            {business && item.status === 'pending' && <Review quote={item} busy={busy} onUpdate={changes => mutate(`/quotes/${item.id}`, 'PATCH', changes, changes.status === 'approved' ? 'Quote approved.' : 'Quote rejected.')} />}
            {!business && item.status === 'approved' && <div className="actions"><button disabled={busy} onClick={() => mutate(`/quotes/${item.id}`, 'PATCH', { status: 'accepted' }, 'Quote accepted.')}>Accept quote</button><button disabled={busy} className="secondary" onClick={() => mutate(`/quotes/${item.id}`, 'PATCH', { status: 'declined' }, 'Quote declined.')}>Decline</button></div>}
            {item.status === 'accepted' && <PaymentPanel key={`${user.id}:${item.id}`} quoteId={item.id} accountId={user.id} business={business} />}
            </div></details>
          </article>)}</div>
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
  return <main className="app-shell"><header className="app-header"><div className="brand"><div><h1>QuoteFlow<span> AI</span></h1></div></div><div className="actions"><button className="secondary theme-toggle" aria-label="Dark mode" aria-pressed={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ Light mode' : '☾ Dark mode'}</button>{user && <button disabled={signingOut} className="secondary" onClick={logout}>{signingOut ? 'Signing out…' : 'Sign out'}</button>}</div></header>
    {user && <div className="account-bar"><span className="account-avatar" aria-hidden="true">{user.name.split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</span><strong>{user.name}</strong><span className="status">{user.role === 'business' ? 'Business owner' : 'Customer'}</span><span className="muted">{user.email}</span></div>}
    {error && <p className="error feedback" role="alert">{error}</p>}
    {customerEntry && !user && <section className="share-panel"><div><h2>Request a quote</h2><p className="muted">Sign in or create a customer account to describe your project and track approval. Your selected business is remembered.</p></div></section>}
    {loading ? <p role="status">Opening QuoteFlow…</p> : recoveryCode ? <RecoveryCode code={recoveryCode} onDone={() => setRecoveryCode('')} /> : user ? <Workspace key={user.id} user={user} onSessionExpired={expired} /> : <AccountForm onSignedIn={result => { setUser(result.user); setRecoveryCode(result.recoveryCode || ''); setError(''); }} />}
    <footer><span>QuoteFlow AI</span><p>USD · Account data is saved on the server. AI reviews are suggestions. You control pricing and approval. PayPal Sandbox checkout uses test money only.</p></footer>
  </main>;
}
