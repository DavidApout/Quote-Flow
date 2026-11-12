import test from 'node:test';
import assert from 'node:assert/strict';
import { dueState, formatAgreedDate, localCalendarDate, matchesDueFilter } from '../src/lib/dueDates.js';

const job = (agreed, overrides = {}) => ({ status: 'accepted', job: { agreed, stage: 'in_progress' }, ...overrides });

test('due filters include today and day seven, but separate overdue and later work', () => {
  const today = '2026-11-11';
  assert.equal(dueState(job('2026-11-10'), today), 'overdue');
  assert.equal(dueState(job(today), today), 'today');
  assert.equal(matchesDueFilter(job(today), 'soon', today), true);
  assert.equal(matchesDueFilter(job('2026-11-18'), 'soon', today), true);
  assert.equal(matchesDueFilter(job('2026-11-19'), 'soon', today), false);
  assert.equal(matchesDueFilter(job('2026-11-10'), 'soon', today), false);
  assert.equal(matchesDueFilter(job('2026-11-10'), 'overdue', today), true);
  assert.equal(matchesDueFilter(job(today), 'overdue', today), false);
});

test('closed requests never show as overdue and requested dates are not commitments', () => {
  for (const quote of [job('2026-11-01', { status: 'rejected' }), job('2026-11-01', { status: 'declined' }), job('2026-11-01', { job: { agreed: '2026-11-01', stage: 'completed' } })]) {
    assert.equal(dueState(quote, '2026-11-11'), 'closed');
    assert.equal(matchesDueFilter(quote, 'overdue', '2026-11-11'), false);
    assert.equal(matchesDueFilter(quote, 'all', '2026-11-11'), true);
  }
  for (const quote of [{ status: 'pending' }, job(''), job('2026-02-30'), { status: 'accepted', job: { requested: '2026-11-01', agreed: '' } }]) {
    assert.equal(dueState(quote, '2026-11-11'), 'unscheduled');
    assert.equal(matchesDueFilter(quote, 'soon', '2026-11-11'), false);
    assert.equal(matchesDueFilter(quote, 'overdue', '2026-11-11'), false);
  }
});

test('calendar comparisons cover DST, leap years, month and year boundaries', () => {
  assert.equal(matchesDueFilter(job('2026-03-10'), 'soon', '2026-03-03'), true);
  assert.equal(matchesDueFilter(job('2026-11-04'), 'soon', '2026-10-28'), true);
  assert.equal(matchesDueFilter(job('2027-01-04'), 'soon', '2026-12-28'), true);
  assert.equal(dueState(job('2028-02-29'), '2028-02-28'), 'soon');
  assert.equal(dueState(job('2026-02-29'), '2026-02-28'), 'unscheduled');
});

test('today and displayed due dates stay on the local calendar near UTC midnight', t => {
  const original = process.env.TZ;
  process.env.TZ = 'America/Chicago';
  t.after(() => { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; });
  assert.equal(localCalendarDate(new Date('2026-11-12T05:30:00Z')), '2026-11-11');
  assert.equal(localCalendarDate(new Date('2026-11-12T06:01:00Z')), '2026-11-12');
  assert.match(formatAgreedDate('2026-11-11'), /11/);
  assert.equal(formatAgreedDate('2026-02-30'), '');
});
