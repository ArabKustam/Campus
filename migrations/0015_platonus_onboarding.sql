ALTER TABLE platonus_connection ADD COLUMN retry_at INTEGER;
ALTER TABLE platonus_connection ADD COLUMN initial_import_done INTEGER NOT NULL DEFAULT 0;
UPDATE platonus_connection SET initial_import_done=1 WHERE EXISTS(SELECT 1 FROM platonus_imports);
