-- Registry-only (central D1). Not part of workspace migrations.
CREATE TABLE IF NOT EXISTS schedule_notifications (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 title TEXT,
 body TEXT,
 subject TEXT,
 lesson_date TEXT,
 payload_json TEXT,
 actor TEXT,
 created_at INTEGER NOT NULL,
 read_at INTEGER
);
CREATE INDEX IF NOT EXISTS schedule_notifications_owner ON schedule_notifications(account_id,created_at DESC);
