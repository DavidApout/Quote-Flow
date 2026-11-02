import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detailQuestion, buildRequestSummary } from '../src/lib/customerGuide.js';
test('guided questions adapt to customer description or selected service', () => {
  assert.match(detailQuestion('Shirts for our café'), /sizes and colors/);
  assert.match(detailQuestion('An opening event', 'Catering'), /dietary/);
  assert.match(detailQuestion('A small project', 'Photography'), /captured/);
  assert.match(detailQuestion('Something unique'), /specifications/);
});
test('request summary preserves customer wording and omits unanswered optional fields', () => {
  assert.equal(buildRequestSummary({ description: ' Navy shirts ', deadline: 'next Friday', details: '4 small, 4 medium, 4 large' }), 'Navy shirts\n\nTiming: next Friday\n\nDetails: 4 small, 4 medium, 4 large');
  assert.equal(buildRequestSummary({ description: 'Custom work', deadline: '', details: '' }), 'Custom work');
});
