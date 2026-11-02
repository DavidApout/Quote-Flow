// Explicit, local-only demo setup. Never run against a production database.
const origin = process.env.DEMO_ORIGIN || 'http://127.0.0.1:5178';
if (new URL(origin).hostname !== '127.0.0.1') throw Error('Demo setup only supports 127.0.0.1.');
const password = 'QuoteFlow local demo 2026!';
async function request(path, body, cookie = '', method = 'POST') {
  const res = await fetch(`${origin}/api${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-QuoteFlow-Request': '1', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json();
  if (!res.ok) throw Error(`${path}: ${data.error || res.status}`);
  return { ...data, cookie: res.headers.get('set-cookie')?.split(';')[0] || cookie };
}
async function account(email, name, role) {
  try { return await request('/auth/login', { email, password }); }
  catch { return request('/auth/register', { email, name, role, password, businessName: 'Studio North' }); }
}
const owner = await account('owner@quoteflow.test', 'Alex Morgan', 'business');
const customer = await account('customer@quoteflow.test', 'Jordan Lee', 'customer');
await request('/services/import', { services: [{ name: 'Brand identity design', price: 450 }, { name: 'Custom printed T-shirt', price: 25 }, { name: 'Social media design', price: 65 }] }, owner.cookie);
const workspace = await request(`/workspace?businessId=${owner.user.id}`, null, customer.cookie, 'GET');
if (!workspace.quotes.length) {
  await request('/quotes', { businessId: owner.user.id, serviceId: workspace.services.find(s => s.name === 'Custom printed T-shirt').id, quantity: 12, request: 'Navy shirts with a cream logo for our coffee shop opening. Sizes: 4 small, 4 medium, 4 large.' }, customer.cookie);
  await request('/quotes', { businessId: owner.user.id, serviceId: 'custom', quantity: 1, request: 'A window illustration for our new coffee shop. Please quote design and print preparation.' }, customer.cookie);
}
console.log(`Demo ready: ${origin}\nOwner: owner@quoteflow.test\nCustomer: customer@quoteflow.test\nPassword for both: ${password}\nCustomer page: ${origin}/request?business=${owner.user.id}\nThese are local demo accounts only; do not deploy this database.`);
