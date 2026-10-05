CREATE TABLE IF NOT EXISTS account_activity (
 account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 visible_ms INTEGER NOT NULL DEFAULT 0,
 mobile_ms INTEGER NOT NULL DEFAULT 0,
 last_seen_at INTEGER,
 last_mobile_at INTEGER,
 started_at INTEGER NOT NULL,
 install_seen_at INTEGER,
 install_request INTEGER NOT NULL DEFAULT 0,
 install_shown INTEGER NOT NULL DEFAULT -1,
 installed_at INTEGER
);
