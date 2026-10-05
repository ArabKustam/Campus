CREATE TABLE IF NOT EXISTS platonus_journals (
 study_year INTEGER NOT NULL,
 term INTEGER NOT NULL,
 payload_json TEXT NOT NULL,
 captured_at TEXT NOT NULL,
 last_error TEXT,
 PRIMARY KEY (study_year, term)
);
CREATE TABLE IF NOT EXISTS platonus_journal_options (
 id INTEGER PRIMARY KEY CHECK(id=1),
 payload_json TEXT NOT NULL,
 captured_at TEXT NOT NULL
);
