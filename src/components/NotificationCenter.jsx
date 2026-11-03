import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function NotificationCenter({ user, onOpen, onSessionExpired }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const refresh = useCallback(async () => { setData(await api('/notifications', { accountId: user.id })); }, [user.id]);
  useEffect(() => {
    let alive = true;
    const update = () => refresh().catch(error => { if (alive) { if (error.status === 401) onSessionExpired(); else setError(error.message); } });
    update(); const timer = setInterval(update, 15000); window.addEventListener('focus', update);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', update); };
  }, [refresh, onSessionExpired]);
  async function act(path, body, done) {
    setBusy(true); setError('');
    try { await api(path, { method: 'POST', body: body || {}, accountId: user.id }); await refresh(); if (done) done(); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  const unread = data?.notifications.filter(n => !n.readAt).length || 0;
  const previewLink = preview?.body.match(/https?:\/\/[^\s]+/)?.[0];
  return <section className="notification-center"><button className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>Notifications {unread > 0 && <span className="nav-count">{unread} unread</span>}</button>
    {open && <div className="panel"><div className="request-heading"><h2>Your updates</h2><button className="secondary" disabled={busy} onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>Refresh notifications</button></div>{error && <p role="alert" className="error">{error}</p>}<p role="status">{notice}</p>
      {data && <><p className="muted">{data.mailMode === 'preview' ? 'Local email preview mode — no emails are sent.' : data.mailMode === 'disabled' ? 'Email delivery is not configured. In-app notifications still work.' : 'Emails are sent through the configured provider.'}</p>
      {!data.verified ? <div className="notice"><p>Verify {user.email} to receive email notifications.</p><button disabled={busy || data.mailMode === 'disabled'} onClick={() => act('/email/verify', {}, () => setNotice(data.mailMode === 'preview' ? 'Verification email is in the previews below.' : 'Verification email queued. Check your inbox.'))}>Send verification email</button></div> : <p className="muted">{data.mailMode === 'preview' ? 'Email confirmation simulated in local preview mode.' : 'Email verified.'}</p>}
      {unread > 0 && <button className="text-button" disabled={busy} onClick={() => act('/notifications/read')}>Mark all read</button>}
      <ul className="notification-list">{data.notifications.map(n => <li key={n.id}><span className={!n.readAt ? 'unread-dot' : ''} aria-label={!n.readAt ? 'Unread' : 'Read'} /><div><strong>{n.title}</strong><p className="muted">{new Date(n.created).toLocaleString()}</p></div><button disabled={busy} className="secondary" onClick={() => act('/notifications/read', { id: n.id }, () => { setOpen(false); onOpen(n.quoteId); })}>Open request</button></li>)}</ul>{!data.notifications.length && <p className="muted">New requests, replies, and quote decisions will appear here.</p>}
      <details><summary>Email status & previews</summary><p className="muted">“Sent” means accepted by the email provider, not delivered or read. Delivered and bounced statuses come from verified provider callbacks; delivered does not mean read. Failed emails need attention. Unverified emails wait for address confirmation.</p><ul className="notification-list">{data.mail.map(m => <li key={m.id}><div><strong>{m.subject}</strong><p className="muted">{m.email} · {m.state} · {m.attempts} attempts</p>{m.error && <p className="error">{m.error}</p>}</div>{data.mailMode === 'preview' && <button className="secondary" onClick={async () => { try { setPreview(await api(`/mail/${m.id}/preview`, { accountId: user.id })); } catch(e) { setError(e.message); } }}>Preview email</button>}</li>)}</ul></details>
      {preview && <section className="mail-preview"><p className="eyebrow">LOCAL PREVIEW · NOT SENT</p><h3>{preview.subject}</h3><p className="muted">To: {preview.email}</p><pre>{preview.body}</pre>{previewLink && <a href={previewLink} target="_blank" rel="noreferrer">Open private test link ↗</a>}<button className="text-button" onClick={() => setPreview(null)}>Close preview</button></section>}</>}
    </div>}
  </section>;
}
