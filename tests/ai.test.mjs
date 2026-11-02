import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewRequest } from '../server/ai.mjs';
const input = { quote: { name: 'Window cleaning', quantity: 5, request: 'Five upstairs windows' }, services: [{ id: 'windows', name: 'Window cleaning', cents: 1250 }] };
const valid = { summary: 'Clean five upstairs windows.', missingDetails: ['Access requirements'], questions: ['How can we access the upstairs windows?'], serviceIds: ['windows'], reply: 'Thanks for your request. How can we access the upstairs windows?' };
const options = value => ({ apiKey: 'test-only', fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) }) });
test('AI review sends only request context and catalog names, and derives match prices on server', async () => {
  const config = options({ ...valid, price: 1, total: 1 }); const mock = config.fetchImpl;
  config.fetchImpl = async (url, request) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const payload = JSON.parse(request.body);
    assert.equal(payload.store, false); assert.equal(payload.text.format.strict, true);
    assert.deepEqual(JSON.parse(payload.input), { request: { service: 'Window cleaning', quantity: 5, details: 'Five upstairs windows' }, services: [{ id: 'windows', name: 'Window cleaning' }] });
    return mock();
  };
  const result = await reviewRequest({ ...input, quote: { ...input.quote, customerEmail: 'private@example.test', customerName: 'Private Name' } }, config);
  assert.deepEqual(result.matches, [{ id: 'windows', name: 'Window cleaning', price: 12.5, total: 62.5 }]);
  assert.equal(result.reply, valid.reply); assert.equal(result.status, undefined);
});
test('custom work can be reviewed with an empty catalog', async () => {
  const result = await reviewRequest({ ...input, services: [] }, options({ ...valid, serviceIds: [] }));
  assert.deepEqual(result.matches, []);
});
test('rejects unknown matches, duplicate matches, malformed or oversized review fields', async () => {
  for (const changes of [{ serviceIds: ['other-business'] }, { serviceIds: ['windows', 'windows'] }, { missingDetails: 'bad' }, { questions: Array(7).fill('Question?') }, { summary: '' }, { reply: 'a'.repeat(3001) }, { questions: [null] }]) {
    await assert.rejects(reviewRequest(input, options({ ...valid, ...changes })), { status: 502 });
  }
});
test('missing configuration, provider failure, refusal and incomplete responses fail safely', async () => {
  await assert.rejects(reviewRequest(input, { apiKey: '' }), { status: 503 });
  await assert.rejects(reviewRequest(input, { apiKey: 'test', fetchImpl: async () => { throw Error('secret'); } }), { status: 502 });
  await assert.rejects(reviewRequest(input, { apiKey: 'test', fetchImpl: async () => ({ ok: false }) }), { status: 502 });
  for (const result of [{ status: 'incomplete' }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal' }] }] }, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{' }] }] }]) {
    await assert.rejects(reviewRequest(input, { apiKey: 'test', fetchImpl: async () => ({ ok: true, json: async () => result }) }), { status: 502 });
  }
});
test('provider access, billing, and model errors give safe actionable messages', async () => {
  for (const [status, message] of [[401, /credentials/], [403, /credentials/], [429, /billing/], [400, /model configuration/], [404, /model configuration/]]) {
    await assert.rejects(reviewRequest(input, { apiKey: 'test', fetchImpl: async () => ({ ok: false, status }) }), error => error.status === 503 && message.test(error.message));
  }
});
