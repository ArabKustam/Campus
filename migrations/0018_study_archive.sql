CREATE TABLE IF NOT EXISTS study_archive_jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, arg TEXT NOT NULL, due_at INTEGER NOT NULL DEFAULT 0, error TEXT);
CREATE TABLE IF NOT EXISTS umkd_catalog (course_id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', payload_json TEXT NOT NULL, captured_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS umkd_documents (course_id TEXT NOT NULL, file_id TEXT NOT NULL, storage_key TEXT NOT NULL, captured_at TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(course_id,file_id));
