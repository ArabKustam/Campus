-- Файлы и заметки к конкретному занятию: материалы получают дату урока, помощник хранит присланные файлы до прикрепления.
ALTER TABLE materials ADD COLUMN lesson_date TEXT;
CREATE INDEX IF NOT EXISTS idx_materials_lesson ON materials(schedule_slot_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_homework_lesson ON homework(schedule_slot_id, due_at);
CREATE TABLE IF NOT EXISTS assistant_files (
  id TEXT PRIMARY KEY,
  assistant_message_id TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  extracted_text TEXT,
  attachment_id TEXT,
  target_label TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_assistant_files_message ON assistant_files(assistant_message_id);
