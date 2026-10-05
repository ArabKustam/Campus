CREATE TABLE assistant_messages (
 id TEXT PRIMARY KEY, text TEXT NOT NULL, context_text TEXT NOT NULL,
 reply TEXT, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','clarification','completed','failed')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE ai_actions ADD COLUMN assistant_message_id TEXT REFERENCES assistant_messages(id);
CREATE UNIQUE INDEX ai_actions_assistant_once ON ai_actions(assistant_message_id) WHERE assistant_message_id IS NOT NULL;
CREATE TABLE ai_usage (
 id TEXT PRIMARY KEY, purpose TEXT NOT NULL, model TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'running', input_tokens INTEGER, output_tokens INTEGER,
 duration_ms INTEGER, error TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ai_usage_date ON ai_usage(created_at);
