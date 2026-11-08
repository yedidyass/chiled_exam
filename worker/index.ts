import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { EXAM_STATUSES, EXAM_TYPES } from '../shared/types';
import type { Child, Exam, ExamStatus, ExamType } from '../shared/types';

type Env = { DB: D1Database; ASSETS: Fetcher };
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

// כל הנתונים של המשפחה בבקשה אחת — משפחה קטנה, אין צורך בדפדוף.
app.get('/me', async (c) => {
  const fid = c.get('familyId');
  const [family, children, exams] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, name FROM families WHERE id = ?').bind(fid),
    c.env.DB.prepare(
      'SELECT id, name, grade, color, emoji, sort_order FROM children WHERE family_id = ? ORDER BY sort_order, created_at',
    ).bind(fid),
    c.env.DB.prepare(
      'SELECT id, child_id, subject, date, type, topics, status, score FROM exams WHERE family_id = ? ORDER BY date, created_at',
    ).bind(fid),
  ]);
  return c.json({ family: family.results[0], children: children.results, exams: exams.results });
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
  return c.json({ id, ...input } satisfies Child, 201);
});

app.put('/children/:id', async (c) => {
  const input = childInput(await body(c));
  const id = c.req.param('id');
  const res = await c.env.DB.prepare(
    'UPDATE children SET name = ?, grade = ?, color = ?, emoji = ?, sort_order = ? WHERE id = ? AND family_id = ?',
  )
    .bind(input.name, input.grade, input.color, input.emoji, input.sort_order, id, c.get('familyId'))
    .run();
  if (!res.meta.changes) return c.json({ error: 'not found' }, 404);
  return c.json({ id, ...input } satisfies Child);
});

app.delete('/children/:id', async (c) => {
  const id = c.req.param('id');
  const fid = c.get('familyId');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM exams WHERE child_id = ? AND family_id = ?').bind(id, fid),
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

app.notFound((c) => c.json({ error: 'not found' }, 404));

export default app;
