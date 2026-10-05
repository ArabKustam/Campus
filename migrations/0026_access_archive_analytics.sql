CREATE TABLE IF NOT EXISTS account_permissions (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, features_json TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS activity_intervals (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, page TEXT NOT NULL, device TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS activity_intervals_time ON activity_intervals(ended_at,account_id);
CREATE TABLE IF NOT EXISTS storage_inventory (id TEXT PRIMARY KEY, kind TEXT NOT NULL, bytes INTEGER NOT NULL, updated_at INTEGER NOT NULL);
