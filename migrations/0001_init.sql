-- משפחה: יחידת השיתוף. כל מכשיר שמחזיק את קוד המשפחה רואה את אותם נתונים.
CREATE TABLE families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE children (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_children_family ON children(family_id);

CREATE TABLE exams (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,              -- YYYY-MM-DD
  type TEXT NOT NULL DEFAULT 'exam', -- exam | quiz | assignment | bagrut
  topics TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'none', -- none | studying | ready
  score REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_exams_family_date ON exams(family_id, date);
