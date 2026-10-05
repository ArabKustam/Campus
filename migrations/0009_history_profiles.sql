CREATE INDEX assistant_messages_page ON assistant_messages(created_at DESC,id DESC);
CREATE INDEX ai_actions_history_page ON ai_actions(created_at DESC,id DESC);
CREATE TABLE action_edits(id TEXT PRIMARY KEY,action_id TEXT NOT NULL REFERENCES ai_actions(id),reason TEXT NOT NULL,before_json TEXT NOT NULL,after_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE INDEX action_edits_action ON action_edits(action_id,created_at);
CREATE TABLE teacher_profiles(teacher_id TEXT PRIMARY KEY REFERENCES teachers(id) ON DELETE CASCADE,teacher_name TEXT NOT NULL,value_json TEXT NOT NULL,fetched_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
