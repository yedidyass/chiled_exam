-- מנויי Web Push: מכשיר אחד = מנוי אחד, משויך למשפחה.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_push_family ON push_subscriptions(family_id);

-- הגדרות שרת (למשל מפתחות VAPID שנוצרים אוטומטית בפעם הראשונה).
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
