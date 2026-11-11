import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';

const maxFileBytes = 1024 * 1024;
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const imageError = 'Choose a valid, non-animated PNG or JPEG image.';

// sharp does not expose APNG animation metadata consistently across libvips builds.
function animatedPng(bytes) {
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) return false; // The decoder rejects broken chunks.
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') return true;
    offset += length + 12;
  }
  return false;
}

export function createAttachments({ db }) {
  db.exec(`CREATE TABLE IF NOT EXISTS quote_attachments (
    id TEXT PRIMARY KEY,
    quote_id TEXT NOT NULL REFERENCES quotes(id),
    name TEXT NOT NULL,
    mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg')),
    bytes BLOB NOT NULL
  ); CREATE INDEX IF NOT EXISTS attachments_quote ON quote_attachments(quote_id);`);

  async function prepareImages(input) {
    if (input === undefined) return [];
    if (!Array.isArray(input) || input.length > 3) fail('Attach up to three images per request.');
    // Validate all encoded sizes before asking the image decoder to allocate pixels.
    const sources = input.map(item => {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 120 || Array.from(item.name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '/' || char === '\\')) fail('Use an image filename of 1 to 120 characters with no paths or control characters.');
      if (typeof item.dataUrl !== 'string' || item.dataUrl.length > Math.ceil(maxFileBytes / 3) * 4 + 23) fail('Each attachment must be at most 1 MB.');
      const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(item.dataUrl);
      if (!match) fail(imageError);
      const bytes = Buffer.from(match[2], 'base64');
      if (!bytes.length || bytes.toString('base64') !== match[2]) fail(imageError);
      if (bytes.length > maxFileBytes) fail('Each attachment must be at most 1 MB.');
      return { name: item.name.trim(), mime: match[1], bytes };
    });
    if (sources.reduce((sum, item) => sum + item.bytes.length, 0) > 3 * maxFileBytes) fail('Attachments must total at most 3 MB.');
    const result = [];
    for (const source of sources) {
      let bytes;
      try {
        const decoder = sharp(source.bytes, { limitInputPixels: 20000000, failOn: 'warning' });
        const meta = await decoder.metadata();
        const expected = source.mime === 'image/png' ? 'png' : 'jpeg';
        if (meta.format !== expected || (meta.pages || 1) !== 1 || !meta.width || !meta.height || (expected === 'png' && animatedPng(source.bytes))) fail(imageError);
        const image = decoder.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });
        // Re-encoding removes EXIF, embedded text, and trailing payloads. PNG retains transparency.
        bytes = await (expected === 'png' ? image.png({ compressionLevel: 9 }) : image.jpeg({ quality: 85 })).toBuffer();
      } catch {
        fail(imageError);
      }
      if (bytes.length > maxFileBytes) fail('This image is too detailed. Use an image under 1 MB after resizing.');
      result.push({ name: source.name, mime: source.mime, bytes, digest: createHash('sha256').update(bytes).digest('hex') });
    }
    return result;
  }

  let active = 0;
  async function prepare(input) {
    if (input === undefined || (Array.isArray(input) && input.length === 0)) return [];
    if (active >= 2) throw Object.assign(new Error('Image processing is busy. Try submitting again shortly.'), { status: 503 });
    active++;
    try { return await prepareImages(input); } finally { active--; }
  }

  function insert(quoteId, prepared) {
    const statement = db.prepare('INSERT INTO quote_attachments (id,quote_id,name,mime,bytes) VALUES (?,?,?,?,?)');
    for (const item of prepared) statement.run(randomUUID(), quoteId, item.name, item.mime, item.bytes);
  }

  function list(quoteId) {
    return db.prepare('SELECT id,name,mime,bytes FROM quote_attachments WHERE quote_id=? ORDER BY rowid').all(quoteId).map(row => ({ id: row.id, name: row.name, dataUrl: `data:${row.mime};base64,${Buffer.from(row.bytes).toString('base64')}` }));
  }
  return { prepare, insert, list };
}
