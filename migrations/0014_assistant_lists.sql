ALTER TABLE assistant_messages ADD COLUMN batch_parent_id TEXT REFERENCES assistant_messages(id);
CREATE INDEX assistant_batch_parent ON assistant_messages(batch_parent_id);
