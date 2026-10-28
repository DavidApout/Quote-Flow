export async function api(path, { method = 'GET', body, signal, accountId } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method, signal, credentials: 'same-origin',
      headers: { ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-QuoteFlow-Request': '1' }), ...(accountId ? { 'X-QuoteFlow-User': accountId } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Cannot reach QuoteFlow. Check your connection and try again.', { cause: error });
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('The account server is unavailable. Start the app with npm run dev.'); }
  if (!response.ok) throw Object.assign(new Error(result.error || 'Something went wrong.'), { status: response.status });
  return result;
}
