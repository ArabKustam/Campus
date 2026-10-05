CREATE TABLE platonus_snapshots (
 id TEXT PRIMARY KEY,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE platonus_imports (
 id TEXT PRIMARY KEY,
 snapshot_id TEXT NOT NULL,
 row_index INTEGER NOT NULL,
 slot_id TEXT NOT NULL,
 before_json TEXT,
 after_json TEXT NOT NULL,
 source_json TEXT NOT NULL,
 reverted_at TEXT,
 guard INTEGER NOT NULL DEFAULT 1 CHECK(guard=1),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(snapshot_id,row_index)
);
