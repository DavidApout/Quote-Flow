import { useId, useRef, useState } from 'react';

async function prepareImage(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 8 * 1024 * 1024) throw Error('Choose a PNG or JPG under 8 MB.');
  const url = await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('Unable to read this image.')); reader.readAsDataURL(file);
  });
  {
    const img = new Image(); img.src = url; await img.decode();
    if (img.width * img.height > 20000000) throw Error('Choose an image smaller than 20 megapixels.');
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL(file.type, .85);
    if (dataUrl.split(',')[1].length * .75 > 1048576) throw Error('This image is too detailed after resizing. Choose a smaller image (under 1 MB when saved).');
    const name = Array.from(file.name).map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '/' || char === '\\' ? '-' : char).join('').slice(0, 120).trim() || 'reference-image';
    return { name, dataUrl };
  }
}

export default function AttachmentPicker({ value, onChange, disabled, onBusyChange }) {
  const id = useId();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  async function choose(files) {
    if (pending.current || disabled || !files.length) return;
    setError('');
    if (files.length + value.length > 3) { setError('You can attach up to 3 images. Remove an image before adding another.'); return; }
    pending.current = true; setLoading(true); onBusyChange(true);
    try { const prepared = []; for (const file of files) prepared.push(await prepareImage(file)); onChange([...value, ...prepared]); }
    catch (e) { setError(e.message || 'This image could not be opened. Choose another PNG or JPG.'); }
    finally { pending.current = false; setLoading(false); onBusyChange(false); }
  }
  return <section className="attachment-picker" aria-label="Reference images"><label htmlFor={id}>Logo or reference photos <span className="muted">(optional)</span></label><p className="muted">Up to 3 PNG/JPG images, 8 MB each before resizing. We save reference copies up to 1600 pixels and 1 MB each; PNG transparency is kept. Keep your original artwork.</p><input id={id} type="file" accept="image/png,image/jpeg" multiple disabled={disabled || loading || value.length >= 3} onChange={e => { void choose(Array.from(e.target.files)); e.target.value = ''; }} />
    {loading && <p role="status">Preparing your images…</p>}{error && <p className="error" role="alert">{error}</p>}
    {value.length > 0 && <ul className="attachment-grid">{value.map((file, index) => <li key={`${file.name}-${index}`}><img src={file.dataUrl} alt={`Preview of ${file.name}`} /><span>{file.name}</span><button type="button" className="secondary" disabled={disabled || loading} onClick={() => { onChange(value.filter((_, i) => i !== index)); setError(''); }}>Remove <span className="sr-only">{file.name}</span></button></li>)}</ul>}
    <p className="muted">Images are shared with this request’s business and saved when you submit. They are not sent to AI.</p>
  </section>;
}
