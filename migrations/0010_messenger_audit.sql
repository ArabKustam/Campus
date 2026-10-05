ALTER TABLE message_sources ADD COLUMN avatar TEXT;
ALTER TABLE message_sources ADD COLUMN display_order INTEGER NOT NULL DEFAULT 999999;
ALTER TABLE ai_actions ADD COLUMN evidence_json TEXT;
CREATE TABLE sender_directory (
 provider TEXT NOT NULL,
 sender_id TEXT NOT NULL,
 name TEXT NOT NULL,
 username TEXT,
 phone TEXT,
 last_seen_at TEXT NOT NULL,
 PRIMARY KEY(provider,sender_id)
);
INSERT OR IGNORE INTO sender_directory(provider,sender_id,name,username,last_seen_at)
 SELECT provider,json_extract(sender_json,'$.id'),coalesce(json_extract(sender_json,'$.name'),'Неизвестный отправитель'),json_extract(sender_json,'$.username'),max(sent_at)
 FROM messages WHERE provider IN ('telegram','whatsapp') AND json_extract(sender_json,'$.id') IS NOT NULL GROUP BY provider,json_extract(sender_json,'$.id');
CREATE INDEX sender_directory_seen ON sender_directory(last_seen_at DESC);
