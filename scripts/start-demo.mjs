import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Use only the persistent fictional demo database; never change the main database.
const database = fileURLToPath(new URL('../data/attachments-demo.sqlite', import.meta.url));
if (!existsSync(database)) throw Error('This command opens the presenter’s saved demo. For a fresh download, follow JUDGE_SETUP.md: npm run dev, then npm run demo:seed in another terminal.');
const db = new DatabaseSync(database, { readOnly: true });
const owner = db.prepare('SELECT id FROM users WHERE email=? AND role=?').get('owner@quoteflow.test', 'business');
db.close();
if (!owner) throw Error('The saved demo business was not found.');
process.env.DATABASE_PATH = database;
process.env.PORT = '5180';
process.env.HOST = '127.0.0.1';
process.env.APP_ORIGIN = 'http://127.0.0.1:5180';
process.env.MAIL_MODE = 'preview';
process.env.PAYPAL_DEMO_BUSINESS_ID = owner.id;
console.log('Opening the saved local demo. Email previews only; PayPal uses test money.');
await import('../server/start.mjs');
