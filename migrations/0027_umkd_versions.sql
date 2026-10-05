CREATE TABLE IF NOT EXISTS umkd_versions (course_id TEXT NOT NULL, file_id TEXT NOT NULL, storage_key TEXT NOT NULL, captured_at TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(course_id,file_id,storage_key));
INSERT OR IGNORE INTO umkd_versions SELECT course_id,file_id,storage_key,captured_at,bytes FROM umkd_documents;
