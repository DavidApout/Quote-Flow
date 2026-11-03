import { useState } from 'react';
import { api } from '../lib/api';
import { buildRequestSummary, detailQuestion } from '../lib/customerGuide';

export default function CustomerAssistant({ services, businessId, accountId, onUse, onSessionExpired, allowAI = true }) {
  const [step, setStep] = useState(0);
  const [description, setDescription] = useState('');
  const [serviceId, setServiceId] = useState('custom');
  const [quantity, setQuantity] = useState('1');
  const [deadline, setDeadline] = useState('');
  const [details, setDetails] = useState('');
  const [summary, setSummary] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [answer, setAnswer] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const service = services.find(item => item.id === serviceId);
  const question = detailQuestion(description, service?.name);
  function advance(event) {
    event.preventDefault(); setError('');
    if (step === 0 && !description.trim()) { setError('Tell us a little about your project first.'); return; }
    if (step === 1 && (!Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 10000)) { setError('Enter a whole-number quantity from 1 to 10,000.'); return; }
    if (step === 3) setSummary(buildRequestSummary({ description, deadline, details }));
    setStep(step + 1);
  }
  async function personalize() {
    setAiBusy(true); setError(''); setNotice('');
    try {
      const result = await api('/requests/guide', { method: 'POST', accountId, body: { businessId, serviceId, quantity: Number(quantity), request: summary } });
      setFollowUp(result.question || ''); setAnswer('');
      setNotice(result.question ? 'Answer below if you can, then add it to your summary.' : 'AI did not flag another question. You can still edit the summary.');
    } catch (error) { if (error.status === 401) onSessionExpired(); else setError(`${error.message} Your summary is ready to use without AI.`); }
    finally { setAiBusy(false); }
  }
  return <section className="customer-assistant" aria-label="Guided request assistant">
    <p className="eyebrow">LET’S SHAPE YOUR REQUEST</p><h3>Tell us what you have in mind.</h3>
    <p className="muted">A guided conversation{allowAI ? ', with an optional AI follow-up.' : '.'} Nothing is submitted until you approve the preview.</p>
    <ol className="guide-progress" aria-label="Request progress">{['Idea', 'Service', 'Timing', 'Details', 'Review'].map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={step === index ? 'active' : ''}>{index + 1}. {label}</li>)}</ol>
    {step > 0 && <div className="chat-answer"><span className="eyebrow">YOUR IDEA</span><p>{description}</p></div>}
    {step < 4 ? <form onSubmit={advance}>
      {step === 0 && <><label htmlFor="guide-idea">What would you like help with?</label><textarea id="guide-idea" required maxLength={700} value={description} onChange={e => setDescription(e.target.value)} placeholder="I need shirts for my café opening…" /><p className="muted">Describe the job in your own words. Avoid sensitive personal information.</p></>}
      {step === 1 && <><label htmlFor="guide-service">Which service fits your idea?</label><select id="guide-service" value={serviceId} onChange={e => setServiceId(e.target.value)}><option value="custom">Not sure / custom request</option>{services.map(item => <option key={item.id} value={item.id}>{item.name} — ${item.price.toFixed(2)} / unit</option>)}</select><label htmlFor="guide-quantity">How many units do you need?</label><input id="guide-quantity" type="number" min="1" max="10000" step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} /><p className="muted">For a single custom project, use 1 and describe its size in the details.</p></>}
      {step === 2 && <><label htmlFor="guide-deadline">When do you need it?</label><input id="guide-deadline" maxLength={150} value={deadline} onChange={e => setDeadline(e.target.value)} placeholder="Next Friday, a specific date, or flexible" /><p className="muted">You can leave this blank if you’re unsure. The business will confirm availability.</p></>}
      {step === 3 && <><label htmlFor="guide-details">{question}</label><textarea id="guide-details" maxLength={700} value={details} onChange={e => setDetails(e.target.value)} placeholder="Share what you know; it’s okay to be unsure." /></>}
      <div className="actions">{step > 0 && <button type="button" className="secondary" onClick={() => setStep(step - 1)}>Back</button>}<button type="submit">{step === 3 ? 'Review my request' : 'Continue'}</button></div>
    </form> : <div className="guide-summary">
      <h4>Your request, ready to review</h4><p className="muted">{service?.name || 'Custom request'} · {quantity} units · {service ? `$${(Math.round(service.price * 100) * Number(quantity) / 100).toFixed(2)} estimated from catalog` : 'The business will confirm pricing'}</p>
      <label htmlFor="guide-summary">Edit your request summary</label><textarea id="guide-summary" maxLength={2000} value={summary} onChange={e => setSummary(e.target.value)} />
      <p className="muted">{summary.length}/2,000 characters · Taxes and fees excluded. Business approval required.</p>
      {allowAI && <details className="guide-ai"><summary>Want help spotting anything missing?</summary><p className="muted">Optional: send this summary, quantity, and service catalog names to OpenAI for one follow-up question. The guided steps above work without AI.</p><button type="button" className="secondary" disabled={aiBusy || !summary.trim()} onClick={personalize}>{aiBusy ? 'Checking details…' : 'Get an AI follow-up'}</button>{followUp && <><label htmlFor="guide-answer">{followUp}</label><textarea id="guide-answer" value={answer} maxLength={500} onChange={e => setAnswer(e.target.value)} /><button type="button" className="secondary" disabled={!answer.trim()} onClick={() => { const next = `${summary}\n\nFollow-up — ${followUp}\n${answer.trim()}`; if (next.length > 2000) { setError('Your summary is too long. Shorten it before adding this answer.'); return; } setSummary(next); setFollowUp(''); setAnswer(''); setNotice('Answer added. Review your summary before continuing.'); }}>Add answer to summary</button></>}</details>}
      <div className="actions"><button type="button" className="secondary" onClick={() => { setStep(0); setNotice(''); }}>Edit answers</button><button type="button" disabled={aiBusy || !summary.trim()} onClick={() => onUse({ serviceId: service && serviceId !== 'custom' ? serviceId : 'custom', quantity: Number(quantity), request: summary.trim() })}>Use this request</button></div>
      <p className="muted">Next: preview and submit. This draft is not saved until you submit.</p>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}<p className="notice" role="status">{notice}</p>
  </section>;
}
