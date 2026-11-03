import { createServer } from 'node:http';
import { mkdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './app.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production');
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const origin = process.env.APP_ORIGIN || `http://127.0.0.1:${port}`;
if (production && !origin.startsWith('https://')) throw Error('Set APP_ORIGIN to your public HTTPS URL for production.');
process.umask(0o077);
const dataDir = resolve(root, 'data');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const api = await createApi({ database: process.env.DATABASE_PATH || resolve(dataDir, 'quoteflow.sqlite'), origin, secure: production, mailMode: process.env.MAIL_MODE || (production ? 'disabled' : 'preview'), mailKey: process.env.RESEND_API_KEY, mailFrom: process.env.MAIL_FROM, mailWebhookSecret: process.env.RESEND_WEBHOOK_SECRET, paypalConfig: { clientId: process.env.PAYPAL_SANDBOX_CLIENT_ID, secret: process.env.PAYPAL_SANDBOX_CLIENT_SECRET, merchantId: process.env.PAYPAL_SANDBOX_MERCHANT_ID, businessId: process.env.PAYPAL_DEMO_BUSINESS_ID } });
const vite = production ? null : await (await import('vite')).createServer({ root, server: { middlewareMode: true, hmr: { port: port + 100 } }, appType: 'spa' });
const dist = resolve(root, 'dist');
if (production && !existsSync(resolve(dist, 'index.html'))) throw Error('Run npm run build before starting production.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  let requestUrl;
  try { requestUrl = new URL(req.url, origin); } catch { res.writeHead(400); res.end(); return; }
  const widget = requestUrl.pathname.match(/^\/widget\/([\w-]+)$/);
  res.setHeader('Content-Security-Policy', `frame-ancestors ${widget ? api.frameAncestors(widget[1]) : "'none'"}; base-uri 'self'; object-src 'none'`);
  if (req.url.startsWith('/api/')) { void api.handle(req, res); return; }
  if (vite) { vite.middlewares(req, res); return; }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors ${widget ? api.frameAncestors(widget[1]) : "'none'"}; form-action 'self'`);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, origin).pathname); } catch { res.writeHead(400); res.end(); return; }
  let file = resolve(dist, `.${pathname}`);
  if (!file.startsWith(dist + '/') && file !== dist) { res.writeHead(404); res.end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) file = resolve(dist, 'index.html');
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
});
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(port, host, () => console.log(`QuoteFlow is ready at ${origin}`));
const mailTimer = setInterval(() => { void api.flushMail().catch(() => console.error('Mail queue check failed.')); }, 5000);
mailTimer.unref();
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  clearInterval(mailTimer);
  server.close(async () => { await vite?.close(); api.close(); process.exit(0); });
  server.closeAllConnections();
});
