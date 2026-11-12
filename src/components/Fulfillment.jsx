import { useState } from 'react';
const categories = { not_received:'Order not received', wrong_damaged:'Wrong or damaged item', payment:'Payment issue', other:'Other' };
export default function Fulfillment({quote, accountId, token, business}) {
  const [data,setData]=useState(null), [draft,setDraft]=useState(null), [error,setError]=useState(''), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false);
  const [category,setCategory]=useState('not_received'), [details,setDetails]=useState('');
  const path=token?'/api/track/fulfillment':`/api/quotes/${quote.id}/fulfillment`;
  async function request(method='GET',body) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response=await fetch(path,{method,headers:{...(token?{'X-QuoteFlow-Token':token}:{'X-QuoteFlow-User':accountId}),...(body?{'Content-Type':'application/json','X-QuoteFlow-Request':'1'}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const result=await response.json(); if(!response.ok) throw Error(result.error || 'Unable to save changes.');
      setData(result);setDraft(result.shipment);
      if(method!=='GET') {setNotice('Saved. The other party has an in-app notification.'); if(method==='POST')setDetails('');}
    } catch(e){setError(e.message);} finally {setBusy(false);}
  }
  return <details className="job-details" onToggle={e=>{if(e.currentTarget.open&&!data&&!busy)void request();}}>
    <summary>Pickup, shipping & issues</summary>
    {error&&<p role="alert" className="error">{error}</p>}
    {busy&&!data&&<p role="status">Loading…</p>}
    {data&&<>
      <h4>{data.shipment.method==='shipping'?'Shipping':'Pickup'}</h4>
      <p>Status: <strong>{data.shipment.status}</strong> · Updated by the business</p>
      {data.shipment.trackingUrl&&<p>{data.shipment.carrier} · {data.shipment.tracking}<br/><a href={data.shipment.trackingUrl} target="_blank" rel="noopener noreferrer">Track shipment ↗</a></p>}
      <p className="muted">Carrier updates are not synced automatically. Pickup and shipping updates are separate from job progress.</p>
      {business&&<form onSubmit={e=>{e.preventDefault();void request('PATCH',{action:'shipment',...draft});}}><fieldset disabled={busy}>
        <label>Delivery method<select value={draft.method} onChange={e=>setDraft({...draft,method:e.target.value,status:'preparing',carrier:e.target.value==='shipping'?'UPS':''})}><option value="pickup">Pickup</option><option value="shipping">Shipping</option></select></label>
        {draft.method==='shipping'&&<><label>Carrier<select value={draft.carrier} onChange={e=>setDraft({...draft,carrier:e.target.value})}>{['UPS','FedEx','USPS','DHL'].map(c=><option key={c}>{c}</option>)}</select></label><label>Tracking number<input maxLength={80} value={draft.tracking} onChange={e=>setDraft({...draft,tracking:e.target.value})}/></label></>}
        <label>Fulfillment status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}>{(draft.method==='shipping'?['preparing','shipped','delivered']:['preparing','ready','collected']).map(s=><option key={s} value={s}>{s}</option>)}</select></label>
        <button>Save pickup / shipping</button>
      </fieldset></form>}
      <h4>Order issues</h4>
      <p className="muted">Reports go to this business. This does not open a PayPal dispute or request a refund from PayPal. Resolving an issue does not confirm a refund. Use Messages & questions to discuss it.</p>
      {!data.issues.length&&<p>No issues reported.</p>}
      {data.issues.map(issue=><article key={issue.id} className="panel"><strong>{categories[issue.category]} · {issue.status}</strong><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{issue.details}</p>{business&&<label>Issue status<select disabled={busy} value={issue.status} onChange={e=>void request('PATCH',{action:'issue',issueId:issue.id,status:e.target.value})}>{['open','reviewing','resolved'].map(s=><option key={s}>{s}</option>)}</select></label>}</article>)}
      {!business&&!data.issues.some(i=>i.status!=='resolved')&&<form onSubmit={e=>{e.preventDefault();void request('POST',{category,details});}}><fieldset disabled={busy}><label>Issue type<select value={category} onChange={e=>setCategory(e.target.value)}>{Object.entries(categories).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>What happened?<textarea required maxLength={2000} value={details} onChange={e=>setDetails(e.target.value)} placeholder="Describe the problem. Do not include passwords or payment details."/></label><button>Report an issue</button></fieldset></form>}
    </>}
    <button type="button" className="text-button" disabled={busy} onClick={()=>void request()}>Refresh shipping & issues</button>
    <p role="status">{notice}</p>
  </details>;
}
