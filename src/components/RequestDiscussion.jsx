import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import AIReview from './AIReview';

export default function RequestDiscussion({ quote, user, onSessionExpired }) {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const requestSequence = useRef(0);
  const handleError = useCallback(error => { if (error.status === 401) onSessionExpired(); else setError(error.message); }, [onSessionExpired]);
  const refresh = useCallback(async () => {
    const seq = ++requestSequence.current;
    const result = await api(`/quotes/${quote.id}/messages`, { accountId: user.id });
    if (seq === requestSequence.current) setMessages(result.messages);
  }, [quote.id, user.id]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const update = () => { if (!pending.current) refresh().catch(error => { if (alive) handleError(error); }); };
    update();
    const timer = setInterval(update, 15000);
    window.addEventListener('focus', update);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', update); };
  }, [open, refresh, handleError]);
  async function send(text) {
    if (pending.current || !text.trim()) return false;
    pending.current = true; ++requestSequence.current; setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/quotes/${quote.id}/messages`, { method: 'POST', accountId: user.id, body: { message: text.trim() } });
      setMessages(result.messages); setOpen(true); setNotice(user.role === 'business' ? 'Message sent to the customer’s request page.' : 'Message sent to the business.');
      return true;
    } catch (error) { handleError(error); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  return <>
    {user.role === 'business' && <AIReview quote={quote} accountId={user.id} onSessionExpired={onSessionExpired} onSendReply={send} sending={busy} />}
    <section className="request-discussion" aria-label="Request conversation">
      <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide conversation' : 'Messages & questions'}</button>
      {error && <p className="error" role="alert">{error}</p>}<p className="notice" role="status">{notice}</p>
      {open && <><div className="request-heading"><h4>Conversation about this request</h4><button type="button" className="text-button" disabled={loading || busy} onClick={async () => { setLoading(true); setError(''); try { await refresh(); } catch (error) { handleError(error); } finally { setLoading(false); } }}>{loading ? 'Refreshing…' : 'Refresh messages'}</button></div>
        <p className="muted">Messages stay with this request. Updates appear every 15 seconds while open. No email notifications yet.</p>
        <ol className="message-list" aria-label="Conversation messages">{messages.map(item => <li key={item.id} className={item.role === user.role ? 'message-own' : ''}><p className="message-author">{item.role === user.role ? 'You' : item.senderName} · {item.role === 'business' ? 'Business' : 'Customer'} <time dateTime={new Date(item.created).toISOString()}>{new Date(item.created).toLocaleString()}</time></p><p className="details">{item.body}</p></li>)}</ol>
        {messages.length === 0 && <p className="muted">No messages yet. Ask a question or share a detail to keep things moving.</p>}
        <form onSubmit={async event => { event.preventDefault(); if (await send(message)) setMessage(''); }}><label htmlFor={`message-${quote.id}`}>{user.role === 'business' ? 'Message to customer' : 'Reply or ask the business'}</label><textarea id={`message-${quote.id}`} required maxLength={3000} value={message} disabled={busy} onChange={e => setMessage(e.target.value)} placeholder="Ask a question or add a detail…" /><button disabled={busy || !message.trim()}>{busy ? 'Sending…' : 'Send message'}</button></form>
      </>}
    </section>
  </>;
}
