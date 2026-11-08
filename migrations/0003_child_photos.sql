-- תמונת ילד: נשמרת בנפרד כדי שהסנכרון הרגיל יישאר קטן.
-- photo_v = 0 אין תמונה; אחרת חותמת זמן של ההעלאה האחרונה (משמשת גם לשבירת מטמון).
ALTER TABLE children ADD COLUMN photo_v INTEGER NOT NULL DEFAULT 0;

CREATE TABLE child_photos (
  child_id TEXT PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
