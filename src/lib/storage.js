const isText = value => typeof value === 'string';
const isMoney = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isQuantity = value => Number.isSafeInteger(value) && value >= 1 && value <= 10000;
const isService = value => value && isText(value.id) && isText(value.name) && isMoney(value.price);
const isQuote = value => value && isText(value.id) && isText(value.name)
  && isText(value.request) && isQuantity(value.quantity)
  && ['pending', 'approved', 'accepted', 'rejected', 'declined'].includes(value.status)
  && ((isMoney(value.price) && isMoney(value.total))
    || (['pending', 'rejected'].includes(value.status) && value.price === null && value.total === null));
const validators = {
  'quoteflow-services': value => Array.isArray(value) && value.every(isService),
  'quoteflow-requests': value => Array.isArray(value) && value.every(isQuote),
  'quoteflow-selected-service-id': isText,
  'quoteflow-request': isText,
  'quoteflow-quantity': value => (isText(value) || typeof value === 'number') && (value === '' || isQuantity(Number(value))),
  'quoteflow-theme': value => value === 'light' || value === 'dark',
};

export function readSaved(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    if (value !== null && (validators[key]?.(value) ?? true)) return value;
    // Preserve the original value for recovery before replacing incompatible data.
    storage.setItem(`${key}-recovery`, raw);
  } catch { /* Invalid JSON or unavailable storage must not prevent rendering. */ }
  return fallback;
}
