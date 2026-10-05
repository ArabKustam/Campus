CREATE TABLE platonus_connection (
 id INTEGER PRIMARY KEY CHECK(id=1),
 revision TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'disconnected',
 session_cipher TEXT,
 challenge_cipher TEXT,
 challenge_until INTEGER,
 last_sync_at TEXT,
 last_error TEXT,
 busy_until INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,
 attempts_until INTEGER NOT NULL DEFAULT 0
);
INSERT INTO platonus_connection(id,revision) VALUES(1,'initial');
