import { useState } from 'react';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export default function DownloadQuote({quote,accountId,token}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function download(){setBusy(true);setError('');try{
 const prefix=token?'/api/track':`/api/quotes/${quote.id}`;
 const headers=token?{'X-QuoteFlow-Token':token}:{'X-QuoteFlow-User':accountId};
 const read=async suffix=>{const r=await fetch(prefix+suffix,{headers});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
 const [payment,job,{refund}]=await Promise.all([read('/payment'),read('/job'),read('/refund')]);
 const paid=payment.state==='paid';
 const money=value=>value===null?'To be confirmed':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
 const rows=[['Request',quote.id],['Quote status',quote.status],['Job status',({not_started:'Not started',in_progress:'In progress',ready:'Ready for pickup',completed:'Completed'})[job.stage] || 'Not started'],['Service',quote.name],['Quantity',quote.quantity],['Unit price',money(quote.price)],['Quote total',money(quote.total)],['Requested date',job.requested||'Not specified'],['Agreed date',job.agreed||'Not agreed']];
 if(paid)rows.push(['Sandbox capture',payment.captureId],['Sandbox amount',money(payment.amount)],['Captured at',new Date(payment.paidAt).toISOString()]);
 if(refund)rows.push(['Refund status',refund.state],['PayPal refund reference',refund.refundId||'Not issued'],['Refund amount',refund.state==='completed'?money(payment.amount):'Not confirmed']);
 const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>QuoteFlow document</title><style>body{font:16px system-ui;color:#172b40;max-width:760px;margin:48px auto;padding:24px}h1{font-size:32px}p{line-height:1.6;white-space:pre-wrap}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:12px;border-bottom:1px solid #ddd;overflow-wrap:anywhere}th{width:35%}.note{background:#f0f5f4;padding:18px}@media print{body{margin:0}}</style><h1>${paid?'Sandbox receipt & quote':'Quote summary'}</h1><h2>${escape(quote.businessName||'QuoteFlow')}</h2><p>Prepared ${escape(new Date().toLocaleDateString())}</p><table>${rows.map(([k,v])=>`<tr><th>${escape(k)}</th><td>${escape(v)}</td></tr>`).join('')}</table><h2>Request details</h2><p>${escape(quote.request)}</p><p class="note">${paid?'Sandbox payment confirmed. No real money collected.':'This document is not proof of payment.'} Service price × quantity. Taxes and additional fees are not included.</p><p>Open this file in your browser and choose Print → Save as PDF.</p></html>`;
 const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));const link=document.createElement('a');link.href=url;link.download=`quoteflow-${quote.id.slice(0,8)}.html`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="document-download"><button className="secondary" disabled={busy} onClick={download}>{busy?'Preparing document…':'Download quote / receipt'}</button>{error&&<p className="error" role="alert">{error}</p>}</div>;
}
