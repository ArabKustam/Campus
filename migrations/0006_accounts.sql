CREATE TABLE accounts (
 id TEXT PRIMARY KEY,
 login TEXT NOT NULL UNIQUE COLLATE NOCASE,
 display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE account_sessions (
 token_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX idx_account_sessions_owner ON account_sessions(account_id);
CREATE TABLE auth_attempts (
 key TEXT PRIMARY KEY,
 count INTEGER NOT NULL,
 reset_at INTEGER NOT NULL
);
CREATE TABLE account_connectors (
 token_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
