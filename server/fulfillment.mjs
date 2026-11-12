import { randomUUID } from 'node:crypto';
const fail = (status, message) => { throw Object.assign(Error(message), { status }); };
const carriers = { UPS: 'https://www.ups.com/track?tracknum=', FedEx: 'https://www.fedex.com/fedextrack/?trknbr=', USPS: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=', DHL: 'https://www.dhl.com/us-en/home/tracking.html?tracking-id=' };
export function createFulfillment({ db, transaction, quoteEvent, bodyOf, send }) {
  db.exec(`CREATE TABLE IF NOT EXISTS fulfillment (quote_id TEXT PRIMARY KEY REFERENCES quotes(id), method TEXT NOT NULL, carrier TEXT NOT NULL, tracking TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_issues (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id), category TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL);`);
  const read = id => {
    const shipment = db.prepare('SELECT method,carrier,tracking,status FROM fulfillment WHERE quote_id=?').get(id) || { method:'pickup', carrier:'', tracking:'', status:'preparing' };
    return { shipment: { ...shipment, trackingUrl: shipment.tracking && carriers[shipment.carrier] ? carriers[shipment.carrier] + encodeURIComponent(shipment.tracking) : '' }, issues: db.prepare('SELECT * FROM order_issues WHERE quote_id=? ORDER BY created DESC').all(id) };
  };
  return async (req,res,id,userId,method) => {
    const quote = db.prepare('SELECT * FROM quotes WHERE id=? AND (business_id=? OR customer_id=?)').get(id,userId,userId);
    if (!quote) fail(404,'Request not found.');
    if (method === 'GET') return send(res,200,read(id));
    const body = await bodyOf(req);
    const owner = quote.business_id === userId;
    if (method === 'PATCH' && body.action === 'shipment') {
      if (!owner) fail(403,'Only the business can update shipping.');
      const { method:delivery, carrier='', tracking='', status } = body;
      if (!['pickup','shipping'].includes(delivery) || !(delivery==='pickup'?['preparing','ready','collected']:['preparing','shipped','delivered']).includes(status)) fail(400,'Choose a valid delivery method and status.');
      if (typeof tracking!=='string' || tracking.length>80 || (tracking && !/^[a-zA-Z0-9 -]+$/.test(tracking)) || (delivery==='shipping' && !Object.hasOwn(carriers,carrier))) fail(400,'Choose a carrier and enter a valid tracking number.');
      if (delivery==='shipping' && status!=='preparing' && !tracking.trim()) fail(400,'Add a tracking number before marking shipped or delivered.');
      if (status!=='preparing' && !db.prepare("SELECT 1 FROM sandbox_payments WHERE quote_id=? AND state='paid'").get(id)) fail(409,'Confirm test payment before fulfillment.');
      transaction(()=>{
        db.prepare('INSERT INTO fulfillment VALUES (?,?,?,?,?) ON CONFLICT(quote_id) DO UPDATE SET method=excluded.method,carrier=excluded.carrier,tracking=excluded.tracking,status=excluded.status').run(id,delivery,delivery==='shipping'?carrier:'',delivery==='shipping'?tracking.trim():'',status);
        quoteEvent(id,`shipping:${randomUUID()}`,'The business updated pickup or shipping details','customer');
      });
    } else if (method==='POST') {
      if (owner) fail(403,'Only the customer can report an issue.');
      if (!['not_received','wrong_damaged','payment','other'].includes(body.category) || typeof body.details!=='string' || !body.details.trim() || body.details.trim().length>2000) fail(400,'Choose an issue and describe it in 1–2,000 characters.');
      if (db.prepare("SELECT 1 FROM order_issues WHERE quote_id=? AND status!='resolved'").get(id)) fail(409,'An issue is already open. Use Messages & questions to add details.');
      transaction(()=>{
        db.prepare('INSERT INTO order_issues VALUES (?,?,?,?,?,?)').run(randomUUID(),id,body.category,body.details.trim(),'open',Date.now());
        quoteEvent(id,`issue:${randomUUID()}`,'The customer reported an order issue','business');
      });
    } else if (method==='PATCH' && body.action==='issue') {
      if (!owner) fail(403,'Only the business can update issue status.');
      if (!['open','reviewing','resolved'].includes(body.status) || !db.prepare('SELECT 1 FROM order_issues WHERE id=? AND quote_id=?').get(body.issueId,id)) fail(400,'Choose an existing issue and valid status.');
      transaction(()=>{
        db.prepare('UPDATE order_issues SET status=? WHERE id=? AND quote_id=?').run(body.status,body.issueId,id);
        quoteEvent(id,`issue:${randomUUID()}`,'The business updated your order issue','customer');
      });
    } else fail(400,'Choose a valid action.');
    return send(res,200,read(id));
  };
}
