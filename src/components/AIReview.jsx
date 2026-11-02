import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export default function AIReview({ quote, accountId, onSessionExpired, onSendReply, sending }) {
  const [review, setReview] = useState(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    api(`/quotes/${quote.id}/review`, { accountId, signal: controller.signal })
      .then(({ review }) => { setReview(review); setReply(review?.reply || ''); })
      .catch(error => { if (error.name !== 'AbortError') { if (error.status === 401) onSessionExpired(); else setError(error.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [quote.id, accountId, onSessionExpired]);
  async function perform(method) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const { review } = await api(`/quotes/${quote.id}/review`, { method, accountId, body: method === 'PATCH' ? { reply } : {} });
      setReview(review); setReply(review.reply);
      setNotice(method === 'PATCH' ? 'Reply draft saved. Saving does not send a message.' : 'Review saved. Check the suggestions before using them.');
    } catch (error) { if (error.status === 401) onSessionExpired(); else setError(error.message); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!loading && !review && quote.status !== 'pending') return null;
  return <section className="ai-review" aria-label="AI review assistant">
    <div className="request-heading"><div><p className="eyebrow">YOUR REVIEW ASSISTANT</p><h3>Turn details into next steps.</h3></div>{review && <span className="status">Saved review</span>}</div>
    {!review && <><p className="muted">Get a summary, missing details, service suggestions, and a reply you can edit.</p><p className="muted">Request details and your service names are sent to OpenAI when you click. You control the price and approval.</p><button type="button" disabled={loading || busy} onClick={() => perform('POST')}>{loading ? 'Checking saved review…' : busy ? 'Reviewing request…' : 'Review with AI'}</button></>}
    {error && <p role="alert" className="error">{error}</p>}
    <p role="status" className="notice">{notice}</p>
    {review && <>
      <p className="details">{review.summary}</p>
      <div className="ai-review-columns"><div><h4>Details to confirm</h4>{review.missingDetails.length ? <ul>{review.missingDetails.map((detail, i) => <li key={i}>{detail}</li>)}</ul> : <p className="muted">No missing details flagged. Check the request yourself before approval.</p>}</div><div><h4>Suggested questions</h4>{review.questions.length ? <ul>{review.questions.map((question, i) => <li key={i}>{question}</li>)}</ul> : <p className="muted">No follow-up questions suggested.</p>}</div></div>
      <h4>Possible catalog matches</h4>
      {review.matches.length ? <ul className="ai-matches">{review.matches.map(service => <li key={service.id}><strong>{service.name}</strong><span>${service.price.toFixed(2)} / unit · ${(service.total).toFixed(2)} for {quote.quantity}</span></li>)}</ul> : <p className="muted">No catalog match suggested. You can price this as custom work.</p>}
      <p className="muted">Catalog prices at review time × requested quantity. Matches are alternatives, not a combined quote. Taxes and fees are excluded.</p>
      <label htmlFor={`reply-${quote.id}`}>Reply draft</label><textarea id={`reply-${quote.id}`} value={reply} maxLength={3000} disabled={busy} onChange={event => { setReply(event.target.value); setNotice(''); }} />
      <div className="actions">{onSendReply && <button type="button" disabled={busy || sending || !reply.trim()} onClick={async () => { if (await onSendReply(reply)) setNotice('Reply sent to the customer’s request conversation.'); }}>Send reply to customer</button>}<button type="button" disabled={busy || !reply.trim() || reply === review.reply} onClick={() => perform('PATCH')}>{busy ? 'Saving…' : 'Save reply draft'}</button><button type="button" className="secondary" disabled={!reply.trim()} onClick={async () => { try { await navigator.clipboard.writeText(reply); setNotice('Reply copied. Paste it into your email or message when ready.'); } catch { setError('Could not copy. Select the reply text and copy it manually.'); } }}>Copy reply</button></div>
      <p className="muted">{reply !== review.reply ? 'Unsaved edits — save before leaving this page. ' : 'Draft saved. '}Only Send reply to customer delivers a message. AI can miss details; review the text before sharing.</p>
    </>}
  </section>;
}
