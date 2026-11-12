// Compare calendar days, not elapsed hours: DST must not move a deadline.
export function localCalendarDate(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const instant = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== value) return null;
  return instant / 86400000;
}

export function dueState(quote, today = localCalendarDate()) {
  if (quote.job?.stage === 'completed' || ['rejected', 'declined'].includes(quote.status)) return 'closed';
  const agreed = calendarDay(quote.job?.agreed);
  const current = calendarDay(today);
  if (agreed === null || current === null) return 'unscheduled';
  const days = agreed - current;
  return days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'later';
}

export function matchesDueFilter(quote, filter, today = localCalendarDate()) {
  if (filter === 'all') return true;
  const state = dueState(quote, today);
  return filter === 'soon' ? state === 'today' || state === 'soon' : filter === 'overdue' && state === 'overdue';
}

export function formatAgreedDate(date) {
  if (calendarDay(date) === null) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}
