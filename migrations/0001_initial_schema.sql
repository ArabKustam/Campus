PRAGMA foreign_keys = ON;

CREATE TABLE subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE teachers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE schedule_slots (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  slot_number INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 10),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  week_type TEXT NOT NULL CHECK (week_type IN ('odd', 'even', 'both')),
  lesson_type TEXT,
  building TEXT,
  room TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  valid_from TEXT,
  valid_until TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(weekday, slot_number, week_type, subject_id, valid_from)
);

CREATE TABLE lesson_overrides (
  id TEXT PRIMARY KEY,
  schedule_slot_id TEXT NOT NULL REFERENCES schedule_slots(id) ON DELETE CASCADE,
  lesson_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'cancelled', 'moved', 'online', 'important', 'exam')),
  moved_date TEXT,
  moved_start_time TEXT,
  moved_end_time TEXT,
  building TEXT,
  room TEXT,
  online_url TEXT,
  note TEXT,
  source_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(schedule_slot_id, lesson_date)
);

CREATE TABLE homework (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  schedule_slot_id TEXT REFERENCES schedule_slots(id) ON DELETE SET NULL,
  lesson_override_id TEXT REFERENCES lesson_overrides(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_at TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'archived')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE materials (
  id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  schedule_slot_id TEXT REFERENCES schedule_slots(id) ON DELETE SET NULL,
  lesson_override_id TEXT REFERENCES lesson_overrides(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('link', 'document', 'image', 'book', 'note')),
  url TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE integrations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE CHECK (provider IN ('telegram', 'whatsapp')),
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected', 'pairing', 'connected', 'error')),
  display_name TEXT,
  external_account_id TEXT,
  credentials_encrypted TEXT,
  config_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(config_json)),
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE message_sources (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('telegram', 'whatsapp')),
  external_chat_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'group' CHECK (source_type IN ('group', 'channel')),
  is_enabled INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(provider, external_chat_id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES message_sources(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('telegram', 'whatsapp')),
  external_message_id TEXT NOT NULL,
  sender_json TEXT NOT NULL CHECK (json_valid(sender_json)),
  text TEXT,
  sent_at TEXT NOT NULL,
  reply_to_json TEXT CHECK (reply_to_json IS NULL OR json_valid(reply_to_json)),
  message_type TEXT NOT NULL,
  raw_payload_json TEXT CHECK (raw_payload_json IS NULL OR json_valid(raw_payload_json)),
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(provider, source_id, external_message_id)
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  material_id TEXT REFERENCES materials(id) ON DELETE CASCADE,
  homework_id TEXT REFERENCES homework(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  provider_file_id TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (message_id IS NOT NULL) +
    (material_id IS NOT NULL) +
    (homework_id IS NOT NULL) = 1
  )
);

CREATE TABLE ai_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual', 'cron', 'message')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  model TEXT NOT NULL,
  messages_scanned INTEGER NOT NULL DEFAULT 0,
  actions_created INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE ai_actions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES ai_runs(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('ADD_HOMEWORK', 'ADD_NOTE', 'ADD_MATERIAL', 'ADD_BOOK_LIST', 'ADD_LINK', 'CANCEL_LESSON', 'MOVE_LESSON', 'CHANGE_ROOM', 'CHANGE_TIME', 'SET_ONLINE', 'IGNORE', 'UNKNOWN')),
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

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'system', 'integration', 'cron')),
  actor_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_schedule_slots_day_week ON schedule_slots(weekday, week_type, slot_number) WHERE is_active = 1;
CREATE INDEX idx_lesson_overrides_date ON lesson_overrides(lesson_date);
CREATE INDEX idx_homework_due ON homework(due_at, status);
CREATE INDEX idx_materials_subject ON materials(subject_id, created_at DESC);
CREATE INDEX idx_messages_source_sent ON messages(source_id, sent_at DESC);
CREATE INDEX idx_messages_processing ON messages(processed_at, sent_at) WHERE processed_at IS NULL;
CREATE INDEX idx_ai_runs_status ON ai_runs(status, created_at);
CREATE INDEX idx_ai_actions_status ON ai_actions(status, created_at);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
