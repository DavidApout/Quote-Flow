import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSaved } from '../src/lib/storage.js';
const storage = raw => ({ getItem: () => raw, setItem() {} });
test('rejects values that would crash array and string operations', () => {
  assert.deepEqual(readSaved(storage('{}'), 'quoteflow-services', []), []);
  assert.deepEqual(readSaved(storage('false'), 'quoteflow-requests', []), []);
  assert.equal(readSaved(storage('42'), 'quoteflow-request', ''), '');
});
test('rejects nonnumeric service prices and missing quote totals', () => {
  assert.deepEqual(readSaved(storage(JSON.stringify([{ id: 's', name: 'Shirt', price: '25' }])), 'quoteflow-services', []), []);
  assert.deepEqual(readSaved(storage(JSON.stringify([{ id: 'q', name: 'Shirt', request: '', quantity: 1, price: 25, status: 'approved' }])), 'quoteflow-requests', []), []);
});
test('keeps valid custom requests and zero-priced services', () => {
  const quotes = [{ id: 'q', name: 'Custom', request: 'Embroidery', quantity: 2, price: null, total: null, status: 'pending' }];
  assert.deepEqual(readSaved(storage(JSON.stringify(quotes)), 'quoteflow-requests', []), quotes);
  const services = [{ id: 's', name: 'Consultation', price: 0 }];
  assert.deepEqual(readSaved(storage(JSON.stringify(services)), 'quoteflow-services', []), services);
});
test('survives invalid JSON and blocked storage', () => {
  assert.equal(readSaved(storage('{broken'), 'quoteflow-request', ''), '');
  assert.equal(readSaved({ getItem() { throw Error('blocked'); } }, 'quoteflow-theme', 'light'), 'light');
});
test('backs up incompatible saved values for recovery', () => {
  let backup;
  readSaved({ getItem: () => '{}', setItem: (key, value) => { backup = [key, value]; } }, 'quoteflow-services', []);
  assert.deepEqual(backup, ['quoteflow-services-recovery', '{}']);
});
