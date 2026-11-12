import { useCallback, useEffect, useRef, useState } from 'react';

const stageLabels = { not_started: 'Not started', in_progress: 'In progress', ready: 'Ready for pickup', completed: 'Completed' };
const formValues = (job, business) => ({ date: business ? job.agreed : job.requested, stage: job.stage });

function JobDetailsForm({ quote, accountId, token, business, onSaved }) {
  const [job, setJob] = useState(null);
  const [draft, setDraft] = useState({ date: '', stage: 'not_started' });
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const edited = useRef(false);
  const pending = useRef(false);
  const expanded = useRef(false);
  const section = useRef(null);
  const sequence = useRef(0);
  const controller = useRef(null);
  const path = token ? '/api/track/job' : `/api/quotes/${quote.id}/job`;

  const refresh = useCallback(async () => {
    if (pending.current) return;
    const current = ++sequence.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    try {
      const response = await fetch(path, { signal: request.signal, headers: token ? { 'X-QuoteFlow-Token': token } : { 'X-QuoteFlow-User': accountId } });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Unable to load job details.');
      if (current !== sequence.current) return;
      setJob(data);
      if (!edited.current) setDraft(formValues(data, business));
      setError('');
    } catch (error) {
      if (current === sequence.current && error.name !== 'AbortError') setError(error.message);
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [path, token, accountId, business]);

  const cancelRequest = useCallback(() => {
    sequence.current += 1;
    controller.current?.abort();
  }, []);

  useEffect(() => {
    const refreshVisible = () => { if (expanded.current && !document.hidden && section.current?.getClientRects().length) void refresh(); };
    const timer = setInterval(refreshVisible, 15000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      cancelRequest();
    };
  }, [refresh, cancelRequest]);

  function edit(field, value) {
    edited.current = true;
    setDirty(true);
    setNotice('');
    setDraft(previous => ({ ...previous, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    const current = ++sequence.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true); setLoading(false); setError(''); setNotice('');
    try {
      const response = await fetch(path, {
        method: 'PATCH', signal: request.signal,
        headers: { 'Content-Type': 'application/json', 'X-QuoteFlow-Request': '1', ...(token ? { 'X-QuoteFlow-Token': token } : { 'X-QuoteFlow-User': accountId }) },
        body: JSON.stringify(business ? { agreed: draft.date, stage: draft.stage } : { requested: draft.date }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Unable to save job details.');
      if (current !== sequence.current) return;
      setJob(data); setDraft(formValues(data, business));
      edited.current = false; setDirty(false); setNotice('Job details saved.');
      onSaved?.(data);
    } catch (error) {
      if (current === sequence.current && error.name !== 'AbortError') setError(error.message);
    } finally {
      if (current === sequence.current) { pending.current = false; setBusy(false); }
    }
  }

  return <details ref={section} className="job-details" onToggle={event => {
    expanded.current = event.currentTarget.open;
    if (expanded.current && !document.hidden && !pending.current) { setLoading(true); void refresh(); }
  }}>
    <summary>Job progress & dates</summary>
    {error && <p role="alert" className="error">{error}</p>}
    {!job && loading && <p role="status">Loading job details…</p>}
    {job && <>
      <p>Requested date: {job.requested || 'Not specified'} · Agreed date: {job.agreed || 'Not agreed'}</p>
      <p><strong>{stageLabels[job.stage] || 'Not started'}</strong></p>
      <p className="muted">Demo fulfillment follows confirmed sandbox payment. Dates are calendar dates. Updates refresh automatically while this section is open.</p>
      <form onSubmit={save}><fieldset disabled={busy}>
        <label>{business ? 'Agreed completion date' : 'When do you need it?'}<input type="date" name={business ? 'agreed' : 'requested'} value={draft.date} onChange={event => edit('date', event.target.value)} /></label>
        {business && <label>Job status<select name="stage" value={draft.stage} onChange={event => edit('stage', event.target.value)}>{Object.entries(stageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <button>{busy ? 'Saving…' : 'Save job details'}</button>
        {dirty && <><p className="muted">You have unsaved changes. Automatic updates will keep your edits.</p><button type="button" className="text-button" onClick={() => { edited.current = false; setDirty(false); setDraft(formValues(job, business)); setNotice('Saved details restored.'); }}>Reset to saved details</button></>}
      </fieldset></form>
    </>}
    <button type="button" className="text-button" disabled={busy || loading} onClick={() => { if (!pending.current) { setLoading(true); void refresh(); } }}>{loading && job ? 'Refreshing…' : 'Refresh job details'}</button>
    <p role="status">{notice}</p>
  </details>;
}

export default function JobDetails(props) {
  // A changed account/private link must not inherit another request's draft.
  return <JobDetailsForm key={`${props.quote.id}:${props.accountId || ''}:${props.token || ''}:${Boolean(props.business)}`} {...props} business={Boolean(props.business)} />;
}
