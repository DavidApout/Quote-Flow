import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftQuote } from '../server/ai.mjs';
const input = { request: 'Clean five windows', services: [{ id: 'windows', name: 'Window cleaning', cents: 1250 }] };
const valid = { serviceId: 'windows', quantity: 5, summary: 'Clean five windows', clarifyingQuestion: null };
const options = value => ({ apiKey: 'test-only', fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }) }) });
test('AI drafts use catalog prices and send no pricing or account information', async () => {
  const config = options(valid); const mock = config.fetchImpl;
  config.fetchImpl = async (url, request) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const payload = JSON.parse(request.body);
    assert.equal(payload.store, false);
    assert.equal(payload.text.format.strict, true);
    assert.deepEqual(JSON.parse(payload.input).services, [{ id: 'windows', name: 'Window cleaning' }]);
    return mock();
  };
  const result = await draftQuote(input, config);
  assert.equal(result.quote.total, 62.5);
  assert.equal(result.quote.request, input.request);
});
test('ambiguous requests return a question without a quote', async () => {
  const result = await draftQuote(input, options({ ...valid, serviceId: null, quantity: null, clarifyingQuestion: 'How many windows?' }));
  assert.equal(result.quote, null);
});
test('unknown service IDs and invalid quantities cannot become drafts', async () => {
  for (const changes of [{ serviceId: 'another-business' }, { quantity: -1 }, { quantity: 1.5 }, { quantity: 10001 }]) {
    await assert.rejects(draftQuote(input, options({ ...valid, ...changes })), { status: 502 });
  }
});
test('missing configuration and provider failures have safe errors', async () => {
  await assert.rejects(draftQuote(input, { apiKey: '' }), { status: 503 });
  await assert.rejects(draftQuote(input, { apiKey: 'test', fetchImpl: async () => { throw Error('secret'); } }), { status: 502 });
  await assert.rejects(draftQuote(input, { apiKey: 'test', fetchImpl: async () => ({ ok: false }) }), { status: 502 });
});
