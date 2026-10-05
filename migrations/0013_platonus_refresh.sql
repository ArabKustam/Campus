ALTER TABLE platonus_connection ADD COLUMN credentials_cipher TEXT;
ALTER TABLE platonus_connection ADD COLUMN schedule_changed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE platonus_connection ADD COLUMN schedule_fingerprint TEXT;
