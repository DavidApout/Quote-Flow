import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createAttachments } from '../server/attachments.mjs';

const url = (bytes, mime = 'image/png') => `data:${mime};base64,${bytes.toString('base64')}`;
const fixture = async () => sharp({ create: { width: 20, height: 10, channels: 4, background: { r: 10, g: 50, b: 100, alpha: .25 } } }).png().toBuffer();
function setup(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE quotes(id TEXT PRIMARY KEY); INSERT INTO quotes VALUES ('quote-1'),('quote-2');");
  return { db, attachments: createAttachments({ db }) };
}

test('attachments preserve PNG transparency, normalize JPEG orientation and discard metadata', async t => {
  const { attachments } = setup(t);
  const png = await fixture();
  const jpeg = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#507060' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const normalized = await attachments.prepare([{ name: ' logo.png ', dataUrl: url(png) }, { name: 'reference.jpg', dataUrl: url(jpeg, 'image/jpeg') }]);
  assert.equal(normalized[0].name, 'logo.png'); assert.match(normalized[0].digest, /^[a-f0-9]{64}$/);
  const pngMeta = await sharp(normalized[0].bytes).metadata(); assert.equal(pngMeta.hasAlpha, true);
  const jpegMeta = await sharp(normalized[1].bytes).metadata();
  assert.equal(jpegMeta.width, 800); assert.equal(jpegMeta.height, 1600);
  assert.equal(jpegMeta.orientation, undefined); assert.equal(jpegMeta.exif, undefined); assert.equal(jpegMeta.icc, undefined);
  assert.equal((await attachments.prepare([{ name: 'logo.png', dataUrl: url(png) }]))[0].digest, normalized[0].digest);
});

test('attachments reject invalid encoding, spoofed types, oversized inputs and unsafe names', async t => {
  const { attachments } = setup(t);
  const png = await fixture(); const item = { name: 'logo.png', dataUrl: url(png) };
  assert.deepEqual(await attachments.prepare(), []);
  for (const input of [null, {}, [item,item,item,item], [{ ...item, name: '../logo.png' }], [{ ...item, name: 'bad\nname.png' }], [{ ...item, name: '' }], [{ ...item, name: 'x'.repeat(121) }], [{ ...item, dataUrl: 'https://example.test/logo.png' }], [{ ...item, dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' }], [{ ...item, dataUrl: url(png,'image/jpeg') }], [{ ...item, dataUrl: 'data:image/png;base64,AAAA' }], [{ ...item, dataUrl: 'data:image/png;base64,AB==' }], [{ ...item, dataUrl: url(Buffer.alloc(1024*1024+1)) }]]) {
    await assert.rejects(attachments.prepare(input), error => error.status === 400);
  }
});

test('attachments reject excessive image dimensions and APNG animation', async t => {
  const { attachments } = setup(t);
  const huge = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#000000' } }).png().toBuffer();
  await assert.rejects(attachments.prepare([{ name:'huge.png',dataUrl:url(huge) }]), error => error.status === 400);
  const png = await fixture();
  // Inject acTL with a correct CRC before IDAT; header metadata remains readable.
  const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8,0); chunk.write('acTL',4); chunk.writeUInt32BE(2,8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4,16)) { crc ^= byte; for (let n=0;n<8;n++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0,16);
  const animated = Buffer.concat([png.subarray(0,33),chunk,png.subarray(33)]);
  await assert.rejects(attachments.prepare([{ name:'animated.png',dataUrl:url(animated) }]), error => error.status === 400);
});

test('attachment inserts participate in transactions and survive reopening SQLite', async t => {
  const dir = await mkdtemp(join(tmpdir(),'quoteflow-attachments-')); t.after(() => rm(dir,{recursive:true,force:true}));
  const file = join(dir,'attachments.sqlite'); let db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE quotes(id TEXT PRIMARY KEY); INSERT INTO quotes VALUES ('quote-1'),('quote-2');");
  let attachments = createAttachments({db});
  const input = await attachments.prepare([{name:'logo.png',dataUrl:url(await fixture())}]);
  db.exec('BEGIN'); attachments.insert('quote-1',input); db.exec('ROLLBACK'); assert.deepEqual(attachments.list('quote-1'),[]);
  db.exec('BEGIN'); attachments.insert('quote-1',input); db.exec('COMMIT');
  const before = attachments.list('quote-1'); assert.equal(before.length,1); assert.equal(before[0].name,'logo.png'); assert.equal('bytes' in before[0],false);
  assert.deepEqual(attachments.list('quote-2'),[]); assert.throws(()=>attachments.insert('missing',input));
  db.close(); db=new DatabaseSync(file); t.after(()=>db.close()); attachments=createAttachments({db});
  assert.deepEqual(attachments.list('quote-1'),before);
});


test('attachment decoder concurrency is bounded and releases capacity after errors', async t => {
  const { attachments } = setup(t);
  const input = [{ name:'logo.png',dataUrl:url(await fixture()) }];
  const first = attachments.prepare(input); const second = attachments.prepare(input);
  await assert.rejects(attachments.prepare(input), error => error.status === 503);
  await Promise.all([first,second]);
  await assert.rejects(attachments.prepare([{name:'bad.png',dataUrl:'invalid'}]));
  assert.equal((await attachments.prepare(input)).length,1);
});
