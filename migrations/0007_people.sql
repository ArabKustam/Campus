CREATE TABLE people (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 nickname TEXT,
 role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','head','curator','teacher','other')),
 trusted INTEGER NOT NULL DEFAULT 0 CHECK(trusted IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE sender_identities (
 provider TEXT NOT NULL CHECK(provider IN ('telegram','whatsapp')),
 sender_id TEXT NOT NULL,
 person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
 PRIMARY KEY(provider, sender_id)
);
CREATE TABLE bridge_connections (
 token_hash TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked INTEGER NOT NULL DEFAULT 0
);
