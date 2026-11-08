import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { EXAM_STATUSES, EXAM_TYPES } from '../shared/types';
import type { Child, Exam, ExamStatus, ExamType } from '../shared/types';
import { getVapid, isPushEndpoint, sendPush } from './push';
import type { PushMessage, Subscription } from './push';
import { dailyMessage, dailyWindow, israelToday, weeklyMessage, weeklyWindow } from './reminders';
import type { ReminderExam } from './reminders';

type Env = { DB: D1Database; ASSETS: Fetcher };

/** ה-subject של VAPID: כתובת יצירת קשר של מפעיל השרת. */
const VAPID_SUBJECT = 'https://github.com/yedidyass/chiled_exam';
type Vars = { familyId: string };
type AppCtx = Context<{ Bindings: Env; Variables: Vars }>;

const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath('/api');

// ---------- עזרים ----------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

class BadRequest extends Error {}

function str(v: unknown, field: string, max: number, required = true): string {
  if (v === undefined || v === null || v === '') {
    if (required) throw new BadRequest(`missing ${field}`);
    return '';
  }
  if (typeof v !== 'string') throw new BadRequest(`invalid ${field}`);
  const s = v.trim();
  if (required && !s) throw new BadRequest(`missing ${field}`);
  if (s.length > max) throw new BadRequest(`${field} too long`);
  return s;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw new BadRequest(`invalid ${field}`);
  return v as T;
}

function score(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1000) throw new BadRequest('invalid score');
  return n;
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function body(c: AppCtx): Promise<Record<string, unknown>> {
  try {
    const b = await c.req.json();
    if (b && typeof b === 'object' && !Array.isArray(b)) return b as Record<string, unknown>;
  } catch {
    /* falls through */
  }
  throw new BadRequest('invalid json');
}

app.onError((err, c) => {
  if (err instanceof BadRequest) return c.json({ error: err.message }, 400);
  console.error(err);
  return c.json({ error: 'server error' }, 500);
});

app.get('/health', (c) => c.json({ ok: true }));

// ---------- משפחה (ללא אימות) ----------

app.post('/family', async (c) => {
  const b = await body(c);
  const name = str(b.name, 'name', 60);
  const id = crypto.randomUUID();
  const token = randomToken();
  await c.env.DB.prepare('INSERT INTO families (id, name, token_hash) VALUES (?, ?, ?)')
    .bind(id, name, await sha256(token))
    .run();
  return c.json({ token, family: { id, name } }, 201);
});

// ---------- אימות: קוד המשפחה נשלח כ-Bearer ----------

async function auth(c: AppCtx, next: Next) {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  const row = await c.env.DB.prepare('SELECT id FROM families WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<{ id: string }>();
  if (!row) return c.json({ error: 'unauthorized' }, 401);
  c.set('familyId', row.id);
  await next();
}

app.use('/me', auth);
app.use('/children/*', auth);
app.use('/children', auth);
app.use('/exams/*', auth);
app.use('/exams', auth);
app.use('/push/*', auth);

// כל הנתונים של המשפחה בבקשה אחת — משפחה קטנה, אין צורך בדפדוף.
app.get('/me', async (c) => {
  const fid = c.get('familyId');
  const [family, children, exams] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, name FROM families WHERE id = ?').bind(fid),
    c.env.DB.prepare(
      'SELECT id, name, grade, color, emoji, sort_order, photo_v FROM children WHERE family_id = ? ORDER BY sort_order, created_at',
    ).bind(fid),
    c.env.DB.prepare(
      'SELECT id, child_id, subject, date, type, topics, status, score FROM exams WHERE family_id = ? ORDER BY date, created_at',
    ).bind(fid),
  ]);
  return c.json({ family: family.results[0], children: children.results, exams: exams.results });
});

// מחיקת המשפחה וכל הנתונים שלה. כל המכשירים המחוברים יקבלו 401 בבקשה הבאה.
app.delete('/me', async (c) => {
  const fid = c.get('familyId');
  // מוחקים במפורש (ולא רק דרך ON DELETE CASCADE) כדי לא להיות תלויים בהגדרות ה-foreign keys
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM push_subscriptions WHERE family_id = ?').bind(fid),
    c.env.DB.prepare('DELETE FROM child_photos WHERE family_id = ?').bind(fid),
    c.env.DB.prepare('DELETE FROM exams WHERE family_id = ?').bind(fid),
    c.env.DB.prepare('DELETE FROM children WHERE family_id = ?').bind(fid),
    c.env.DB.prepare('DELETE FROM families WHERE id = ?').bind(fid),
  ]);
  return c.body(null, 204);
});

app.put('/me', async (c) => {
  const b = await body(c);
  const name = str(b.name, 'name', 60);
  await c.env.DB.prepare('UPDATE families SET name = ? WHERE id = ?').bind(name, c.get('familyId')).run();
  return c.json({ id: c.get('familyId'), name });
});

// ---------- ילדים ----------

function childInput(b: Record<string, unknown>) {
  const color = str(b.color, 'color', 7);
  if (!COLOR_RE.test(color)) throw new BadRequest('invalid color');
  return {
    name: str(b.name, 'name', 40),
    grade: str(b.grade, 'grade', 20, false),
    color,
    emoji: str(b.emoji, 'emoji', 16, false),
    sort_order: Number.isInteger(b.sort_order) ? (b.sort_order as number) : 0,
  };
}

app.post('/children', async (c) => {
  const input = childInput(await body(c));
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO children (id, family_id, name, grade, color, emoji, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, c.get('familyId'), input.name, input.grade, input.color, input.emoji, input.sort_order)
    .run();
  return c.json({ id, ...input, photo_v: 0 } satisfies Child, 201);
});

app.put('/children/:id', async (c) => {
  const input = childInput(await body(c));
  const id = c.req.param('id');
  const row = await c.env.DB.prepare(
    `UPDATE children SET name = ?, grade = ?, color = ?, emoji = ?, sort_order = ? WHERE id = ? AND family_id = ?
     RETURNING id, name, grade, color, emoji, sort_order, photo_v`,
  )
    .bind(input.name, input.grade, input.color, input.emoji, input.sort_order, id, c.get('familyId'))
    .first<Child>();
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

// ---------- תמונת ילד ----------

const MAX_PHOTO_BYTES = 300 * 1024;

/** מזהה את סוג התמונה לפי תוכן הקובץ (לא סומכים על Content-Type מהלקוח). */
function sniffImage(b: Uint8Array): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

app.get('/children/:id/photo', async (c) => {
  const row = await c.env.DB.prepare('SELECT mime, data FROM child_photos WHERE child_id = ? AND family_id = ?')
    .bind(c.req.param('id'), c.get('familyId'))
    .first<{ mime: string; data: ArrayBuffer | number[] }>();
  if (!row) return c.json({ error: 'not found' }, 404);
  const bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data);
  return c.body(bytes, 200, {
    'Content-Type': row.mime,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
});

app.put('/children/:id/photo', async (c) => {
  const id = c.req.param('id');
  const fid = c.get('familyId');
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (!bytes.length) throw new BadRequest('empty image');
  if (bytes.length > MAX_PHOTO_BYTES) throw new BadRequest('image too large');
  const mime = sniffImage(bytes);
  if (!mime) throw new BadRequest('unsupported image');
  const owns = await c.env.DB.prepare('SELECT 1 FROM children WHERE id = ? AND family_id = ?').bind(id, fid).first();
  if (!owns) return c.json({ error: 'not found' }, 404);
  const v = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO child_photos (child_id, family_id, mime, data) VALUES (?, ?, ?, ?)
       ON CONFLICT(child_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = datetime('now')`,
    ).bind(id, fid, mime, bytes),
    c.env.DB.prepare('UPDATE children SET photo_v = ? WHERE id = ? AND family_id = ?').bind(v, id, fid),
  ]);
  return c.json({ photo_v: v });
});

app.delete('/children/:id/photo', async (c) => {
  const id = c.req.param('id');
  const fid = c.get('familyId');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM child_photos WHERE child_id = ? AND family_id = ?').bind(id, fid),
    c.env.DB.prepare('UPDATE children SET photo_v = 0 WHERE id = ? AND family_id = ?').bind(id, fid),
  ]);
  return c.json({ photo_v: 0 });
});

app.delete('/children/:id', async (c) => {
  const id = c.req.param('id');
  const fid = c.get('familyId');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM exams WHERE child_id = ? AND family_id = ?').bind(id, fid),
    c.env.DB.prepare('DELETE FROM child_photos WHERE child_id = ? AND family_id = ?').bind(id, fid),
    c.env.DB.prepare('DELETE FROM children WHERE id = ? AND family_id = ?').bind(id, fid),
  ]);
  return c.body(null, 204);
});

// ---------- מבחנים ----------

async function examInput(c: AppCtx, b: Record<string, unknown>) {
  const child_id = str(b.child_id, 'child_id', 64);
  const owns = await c.env.DB.prepare('SELECT 1 FROM children WHERE id = ? AND family_id = ?')
    .bind(child_id, c.get('familyId'))
    .first();
  if (!owns) throw new BadRequest('invalid child_id');
  const date = str(b.date, 'date', 10);
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new BadRequest('invalid date');
  return {
    child_id,
    subject: str(b.subject, 'subject', 60),
    date,
    type: (b.type === undefined ? 'exam' : oneOf(b.type, EXAM_TYPES, 'type')) as ExamType,
    topics: str(b.topics, 'topics', 2000, false),
    status: (b.status === undefined ? 'none' : oneOf(b.status, EXAM_STATUSES, 'status')) as ExamStatus,
    score: score(b.score),
  };
}

app.post('/exams', async (c) => {
  const input = await examInput(c, await body(c));
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO exams (id, family_id, child_id, subject, date, type, topics, status, score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, c.get('familyId'), input.child_id, input.subject, input.date, input.type, input.topics, input.status, input.score)
    .run();
  return c.json({ id, ...input } satisfies Exam, 201);
});

app.put('/exams/:id', async (c) => {
  const input = await examInput(c, await body(c));
  const id = c.req.param('id');
  const res = await c.env.DB.prepare(
    `UPDATE exams SET child_id = ?, subject = ?, date = ?, type = ?, topics = ?, status = ?, score = ?,
       updated_at = datetime('now') WHERE id = ? AND family_id = ?`,
  )
    .bind(input.child_id, input.subject, input.date, input.type, input.topics, input.status, input.score, id, c.get('familyId'))
    .run();
  if (!res.meta.changes) return c.json({ error: 'not found' }, 404);
  return c.json({ id, ...input } satisfies Exam);
});

app.delete('/exams/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM exams WHERE id = ? AND family_id = ?')
    .bind(c.req.param('id'), c.get('familyId'))
    .run();
  return c.body(null, 204);
});

// ---------- התראות push ----------

app.get('/push/key', async (c) => c.json({ publicKey: (await getVapid(c.env.DB)).publicKey }));

function subInput(b: Record<string, unknown>): Subscription {
  const endpoint = str(b.endpoint, 'endpoint', 1000);
  if (!isPushEndpoint(endpoint)) throw new BadRequest('unsupported push service');
  const keys = (b.keys ?? {}) as Record<string, unknown>;
  return { endpoint, p256dh: str(keys.p256dh, 'p256dh', 200), auth: str(keys.auth, 'auth', 100) };
}

app.post('/push/subscribe', async (c) => {
  const sub = subInput(await body(c));
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, family_id, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET family_id = excluded.family_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(sub.endpoint, c.get('familyId'), sub.p256dh, sub.auth)
    .run();
  return c.json({ ok: true });
});

app.post('/push/unsubscribe', async (c) => {
  const endpoint = str((await body(c)).endpoint, 'endpoint', 1000);
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND family_id = ?').bind(endpoint, c.get('familyId')).run();
  return c.body(null, 204);
});

app.post('/push/test', async (c) => {
  const endpoint = str((await body(c)).endpoint, 'endpoint', 1000);
  const sub = await c.env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ? AND family_id = ?')
    .bind(endpoint, c.get('familyId'))
    .first<Subscription>();
  if (!sub) return c.json({ error: 'not subscribed' }, 404);
  const status = await sendPush(sub, { title: 'התראות פועלות ✓', body: 'תקבלו תזכורת ערב לפני כל מבחן.', tag: 'test', url: '/' }, await getVapid(c.env.DB), VAPID_SUBJECT);
  if (status === 404 || status === 410) await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
  return c.json({ status }, status >= 200 && status < 300 ? 200 : 502);
});

app.notFound((c) => c.json({ error: 'not found' }, 404));

// ---------- תזכורות מתוזמנות (Cron Triggers, ראו wrangler.jsonc) ----------

const WEEKLY_CRON = '30 5 * * SUN';

async function sendReminders(env: Env, kind: 'daily' | 'weekly', now = new Date()) {
  const today = israelToday(now);
  const { from, to } = kind === 'weekly' ? weeklyWindow(today) : dailyWindow(today);
  const { results: exams } = await env.DB.prepare(
    `SELECT e.family_id, e.date, e.subject, e.type, e.status, c.name AS child_name, c.emoji
       FROM exams e JOIN children c ON c.id = e.child_id
      WHERE e.date BETWEEN ? AND ? AND e.score IS NULL
        AND e.family_id IN (SELECT DISTINCT family_id FROM push_subscriptions)
      ORDER BY e.date, c.sort_order`,
  )
    .bind(from, to)
    .all<ReminderExam>();
  if (!exams.length) return;

  const byFamily = new Map<string, ReminderExam[]>();
  for (const e of exams) byFamily.set(e.family_id, [...(byFamily.get(e.family_id) ?? []), e]);

  const vapid = await getVapid(env.DB);
  const dead: string[] = [];
  let sent = 0;
  for (const [familyId, list] of byFamily) {
    const msg: PushMessage | null = kind === 'weekly' ? weeklyMessage(list, today) : dailyMessage(list, today);
    if (!msg) continue;
    const { results: subs } = await env.DB.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE family_id = ?')
      .bind(familyId)
      .all<Subscription>();
    await Promise.all(
      subs.map(async (s) => {
        try {
          const status = await sendPush(s, msg, vapid, VAPID_SUBJECT);
          if (status === 404 || status === 410) dead.push(s.endpoint);
          else if (status >= 200 && status < 300) sent++;
          else console.warn('push failed', status, new URL(s.endpoint).host);
        } catch (err) {
          console.error('push error', err);
        }
      }),
    );
  }
  if (dead.length) await env.DB.batch(dead.map((e) => env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(e)));
  console.log(`${kind} reminders: ${sent} sent, ${dead.length} expired subscriptions removed`);
}

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sendReminders(env, controller.cron === WEEKLY_CRON ? 'weekly' : 'daily', new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
