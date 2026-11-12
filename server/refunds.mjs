import { randomUUID } from 'node:crypto';
import { sandboxTransport } from './paypal.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const validId=id=>typeof id==='string'&&/^[A-Z0-9]{8,32}$/.test(id);
export function createRefunds({db,now,transaction,quoteEvent,config={},transport}) {
  db.exec(`CREATE TABLE IF NOT EXISTS refund_requests (quote_id TEXT PRIMARY KEY REFERENCES quotes(id), reason TEXT NOT NULL, state TEXT NOT NULL, decision TEXT NOT NULL DEFAULT '', request_key TEXT NOT NULL UNIQUE, started INTEGER, refund_id TEXT UNIQUE, completed INTEGER, lease_until INTEGER NOT NULL DEFAULT 0)`);
  const remote=transport||sandboxTransport(config);
  const rowOf=id=>db.prepare('SELECT * FROM refund_requests WHERE quote_id=?').get(id);
  const info=id=>{const r=rowOf(id);return r?{reason:r.reason,state:r.state,decision:r.decision,refundId:r.refund_id,completedAt:r.completed}:null;};
  const event=(id,title)=>{for(const role of ['business','customer'])quoteEvent(id,`refund:${randomUUID()}`,title,role);};
  async function act(quote,userId,body) {
    const owner=quote.business_id===userId;
    const payment=db.prepare('SELECT * FROM sandbox_payments WHERE quote_id=?').get(quote.id);
    if(!payment||payment.state!=='paid'||!validId(payment.capture_id))fail(409,'A confirmed test payment is required.');
    let row=rowOf(quote.id);
    if(body.action==='request') {
      if(owner)fail(403,'Only the customer can request a refund.');
      if(row)fail(409,'A refund request already exists. Use Messages & questions to discuss it.');
      if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>2000)fail(400,'Describe your refund request in 1–2,000 characters.');
      transaction(()=>{db.prepare('INSERT INTO refund_requests (quote_id,reason,state,request_key) VALUES (?,?,?,?)').run(quote.id,body.reason.trim(),'requested',randomUUID());event(quote.id,'Customer requested a full test-payment refund');});
      return info(quote.id);
    }
    if(!owner)fail(403,'Only the business can review or process a refund.');
    if(!row)fail(409,'No refund was requested.');
    if(body.action==='decline') {
      if(row.state!=='requested')fail(409,'This refund can no longer be declined.');
      if(typeof body.decision!=='string'||!body.decision.trim()||body.decision.trim().length>1000)fail(400,'Explain the decision in 1–1,000 characters.');
      transaction(()=>{db.prepare("UPDATE refund_requests SET state='declined',decision=? WHERE quote_id=?").run(body.decision.trim(),quote.id);event(quote.id,'The business declined the refund request');});return info(quote.id);
    }
    if(!['approve','check'].includes(body.action))fail(400,'Choose a refund action.');
    if(row.state==='completed')return info(quote.id);
    if(['declined','failed'].includes(row.state))fail(409,'Contact the business for manual review.');
    if(quote.business_id!==config.businessId||payment.merchant!==config.merchantId||!(transport||(config.clientId&&config.secret)))fail(503,'Refunds are not configured for this business.');
    if(!db.prepare('UPDATE refund_requests SET lease_until=? WHERE quote_id=? AND lease_until<=?').run(now()+120000,quote.id,now()).changes)fail(409,'Refund is being processed. Try again shortly.');
    try {
      if(!row.refund_id) {
        if(body.action==='check')fail(409,'No refund reference yet. The business can retry approval safely for 30 minutes, then must review it in PayPal.');
        if(row.started!==null&&now()-row.started>30*60*1000)fail(409,'Refund outcome needs manual PayPal review. Do not issue a replacement refund.');
        const capture=await remote(`/v2/payments/captures/${payment.capture_id}`);
        if(capture.id!==payment.capture_id||capture.status!=='COMPLETED'||capture.amount?.currency_code!=='USD'||capture.amount?.value!==(payment.cents/100).toFixed(2))fail(409,'Capture changed or already refunded. Review it in PayPal before continuing.');
        db.prepare("UPDATE refund_requests SET state='processing',started=COALESCE(started,?) WHERE quote_id=?").run(now(),quote.id);
        const refund=await remote(`/v2/payments/captures/${payment.capture_id}/refund`,{method:'POST',requestId:row.request_key,body:{amount:{currency_code:'USD',value:(payment.cents/100).toFixed(2)}}});
        if(!validId(refund.id))fail(502,'PayPal did not return a refund reference. Manual review may be needed.');
        db.prepare('UPDATE refund_requests SET refund_id=? WHERE quote_id=?').run(refund.id,quote.id);
        row=rowOf(quote.id);
      }
      const verified=await remote(`/v2/payments/refunds/${row.refund_id}`);
      if(verified.id!==row.refund_id||verified.amount?.currency_code!=='USD'||verified.amount?.value!==(payment.cents/100).toFixed(2))fail(502,'Refund details do not match. Contact the business.');
      const state=verified.status==='COMPLETED'?'completed':['FAILED','CANCELLED'].includes(verified.status)?'failed':'pending';
      transaction(()=>{db.prepare('UPDATE refund_requests SET state=?,completed=? WHERE quote_id=?').run(state,state==='completed'?now():null,quote.id);if(state!==row.state)event(quote.id,state==='completed'?'PayPal confirmed the full sandbox refund':`Sandbox refund status: ${state}`);});
      return info(quote.id);
    } finally {db.prepare('UPDATE refund_requests SET lease_until=0 WHERE quote_id=?').run(quote.id);}
  }
  return {info,act};
}
