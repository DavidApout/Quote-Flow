import { useEffect, useState } from 'react';
import { api } from '../lib/api';
export default function QuoteRating({ quoteId, accountId, business }) {
  const [stars, setStars] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let alive = true; api(`/quotes/${quoteId}/rating`, { accountId }).then(data => { if (alive) setStars(data.stars ? String(data.stars) : ''); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [quoteId, accountId]);
  return <details className="quote-rating"><summary>Rate this {business ? 'customer' : 'business'}</summary><p className="muted">Feedback about your quote experience. Sandbox payment does not verify real-world service completion.</p><form onSubmit={async e => { e.preventDefault(); setBusy(true); setNotice(''); setError(''); try { await api(`/quotes/${quoteId}/rating`, { method: 'POST', accountId, body: { stars: Number(stars) } }); setNotice('Rating saved. You can update it here.'); window.dispatchEvent(new Event('quoteflow-profile-change')); } catch (e) { setError(e.message); } finally { setBusy(false); } }}><label htmlFor={`rating-${quoteId}`}>Your rating</label><select id={`rating-${quoteId}`} required disabled={busy} value={stars} onChange={e => setStars(e.target.value)}><option value="">Choose stars</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{'★'.repeat(n)} · {n} out of 5</option>)}</select><button disabled={busy || !stars}>{busy ? 'Saving…' : 'Save rating'}</button></form>{error && <p className="error" role="alert">{error}</p>}<p role="status">{notice}</p></details>;
}
