CREATE TABLE IF NOT EXISTS account_profiles(account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,platonus_name TEXT,platonus_group TEXT,connected INTEGER NOT NULL DEFAULT 0,last_sync_at TEXT,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS account_profiles_connected ON account_profiles(connected,account_id);
CREATE TABLE IF NOT EXISTS account_events(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,kind TEXT NOT NULL,page TEXT NOT NULL,device TEXT NOT NULL,browser TEXT NOT NULL,detail TEXT,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS account_events_time ON account_events(created_at DESC);
CREATE INDEX IF NOT EXISTS account_events_user_time ON account_events(account_id,created_at DESC);
CREATE TABLE IF NOT EXISTS tutorial_progress(account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,sections_json TEXT NOT NULL DEFAULT '[]');
