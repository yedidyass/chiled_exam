// מוודא שמסד D1 קיים בחשבון Cloudflare (יוצר אם לא) וכותב את ה-id שלו ל-wrangler.jsonc.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const NAME = 'chiled-exam-db';
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000';
const wrangler = (...args) => execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const find = () => JSON.parse(wrangler('d1', 'list', '--json')).find((d) => d.name === NAME);

let db = find();
if (!db) {
  console.log(`Creating D1 database ${NAME}…`);
  wrangler('d1', 'create', NAME);
  db = find();
}
if (!db?.uuid) throw new Error(`D1 database ${NAME} not found after create`);

const cfg = readFileSync('wrangler.jsonc', 'utf8');
writeFileSync('wrangler.jsonc', cfg.replace(PLACEHOLDER, db.uuid));
console.log(`Using D1 database ${NAME} (${db.uuid})`);
