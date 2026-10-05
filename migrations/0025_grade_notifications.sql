CREATE TABLE IF NOT EXISTS grade_notifications (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 original TEXT NOT NULL,
 study_year INTEGER NOT NULL,
 term INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 read_at INTEGER
);
CREATE INDEX IF NOT EXISTS grade_notifications_owner ON grade_notifications(account_id,created_at DESC);
