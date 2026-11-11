import { useEffect, useState } from 'react';
export default function RequestAttachments({ quoteId, accountId, token }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const path = token ? '/api/track/attachments' : `/api/quotes/${quoteId}/attachments`;
    fetch(path, { signal: controller.signal, credentials: token ? 'omit' : 'same-origin', headers: token ? { 'X-QuoteFlow-Token': token } : { 'X-QuoteFlow-User': accountId } }).then(async response => { const result = await response.json(); if (!response.ok) throw Error(result.error || 'Unable to load images.'); return result; }).then(result => { setFiles(result.attachments); setError(''); }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [open, quoteId, accountId, token, retry]);
  return <details className="request-attachments" onToggle={e => setOpen(e.currentTarget.open)}><summary>Logo & reference images</summary>{open && <>
    {error ? <div><p className="error" role="alert">{error}</p><button className="secondary" onClick={() => setRetry(n => n + 1)}>Retry loading images</button></div> : files === null ? <p role="status">Loading images…</p> : files.length === 0 ? <p className="muted">No images attached to this request.</p> : <><p className="muted">Reference copies supplied with the request. Select an image to see a larger preview.</p><div className="attachment-gallery">{files.map(file => <details key={file.id}><summary><img src={file.dataUrl} alt={`Reference: ${file.name}`} /><span>{file.name}</span></summary><img className="attachment-full" src={file.dataUrl} alt={`Expanded reference: ${file.name}`} /><a href={file.dataUrl} download={file.name}>Save reference image</a></details>)}</div></>}
  </>}</details>;
}
