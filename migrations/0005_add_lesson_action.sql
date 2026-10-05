CREATE TABLE ai_actions_new (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('ADD_LESSON', 'ADD_HOMEWORK', 'ADD_NOTE', 'ADD_MATERIAL', 'ADD_BOOK_LIST', 'ADD_LINK', 'CANCEL_LESSON', 'MOVE_LESSON', 'CHANGE_ROOM', 'CHANGE_TIME', 'SET_ONLINE', 'IGNORE', 'UNKNOWN')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  revert_payload_json TEXT CHECK (revert_payload_json IS NULL OR json_valid(revert_payload_json)),
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  reason TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  target_schedule_slot_id TEXT REFERENCES schedule_slots(id) ON DELETE SET NULL,
  target_date TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'conflict')),
  validation_errors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(validation_errors_json)),
  auto_applied INTEGER NOT NULL DEFAULT 0 CHECK (auto_applied IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'applied', 'rejected', 'reverted')),
  applied_entity_type TEXT,
  applied_entity_id TEXT,
  applied_at TEXT,
  rejected_at TEXT,
  reverted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO ai_actions_new SELECT * FROM ai_actions;
DROP TABLE ai_actions;
ALTER TABLE ai_actions_new RENAME TO ai_actions;
CREATE INDEX idx_ai_actions_status ON ai_actions(status, created_at);
