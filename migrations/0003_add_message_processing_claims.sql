ALTER TABLE messages ADD COLUMN processing_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (processing_status IN ('pending', 'processing', 'processed'));
ALTER TABLE messages ADD COLUMN processing_run_id TEXT;
ALTER TABLE messages ADD COLUMN processing_started_at TEXT;
ALTER TABLE messages ADD COLUMN processing_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_messages_processing_status ON messages(processing_status, sent_at);