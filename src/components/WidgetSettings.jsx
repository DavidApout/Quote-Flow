import { useEffect, useState } from 'react';
import { api } from '../lib/api';
export default function WidgetSettings({ accountId }) {
  const [data, setData] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [origins, setOrigins] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api('/widget-settings', { accountId, signal: controller.signal }).then(result => { setData(result); setEnabled(result.enabled); setOrigins(result.origins.join('\n')); }).catch(e => { if(e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [accountId]);
  const embed = data ? `<iframe src="${data.url}" title="Request a quote" width="100%" height="820" style="border:0;border-radius:16px" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>` : '';
  return <section className="panel"><p className="eyebrow">YOUR WEBSITE → YOUR INBOX</p><h2>Website quote widget</h2><p className="muted">Customers request quotes without creating an account. Their email receives a private tracking link.</p>{error && <p className="error" role="alert">{error}</p>}<p role="status">{notice}</p>
    {data && <><form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { const result = await api('/widget-settings', { method:'POST', accountId, body:{enabled,origins:origins.split('\n').map(s=>s.trim()).filter(Boolean)} }); setData(result); setNotice('Widget settings saved.'); } catch(e) {setError(e.message);} finally {setBusy(false);} }}><fieldset disabled={busy}><label className="check-label"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} /> Accept website requests</label><label htmlFor="widget-origins">Websites allowed to embed your widget</label><textarea id="widget-origins" value={origins} onChange={e=>setOrigins(e.target.value)} placeholder={'https://yourbusiness.com\nhttps://www.yourbusiness.com'} /><p className="muted">One exact website origin per line, up to five. Use HTTPS with no path or trailing slash. Leave blank for a standalone page only.</p><button>Save widget settings</button></fieldset></form>
      {data.enabled && <><h3>Shareable request page</h3><a href={data.url} target="_blank" rel="noreferrer">Open your customer widget ↗</a><p className="muted">Local links work on this computer only. Hosting with HTTPS is required for real customers.</p><h3>Embed on your website</h3><label htmlFor="embed-code">Copy this HTML into your website</label><textarea id="embed-code" readOnly value={embed} /><button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(embed);setNotice('Embed code copied.');}catch{setError('Select the embed code and copy it manually.');}}}>Copy embed code</button></>}
      <p className="muted">{data.mailMode === 'preview' ? 'Demo email mode: previews are in Notifications. No emails leave this app.' : 'Verify your email in Notifications before enabling the widget for production.'}</p></>}
  </section>;
}
