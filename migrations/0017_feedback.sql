CREATE TABLE IF NOT EXISTS support_config (id INTEGER PRIMARY KEY CHECK(id=1), chat_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS support_tickets (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, body TEXT NOT NULL, page TEXT NOT NULL, created_at INTEGER NOT NULL,
 telegram_message_id INTEGER, delivery_claim INTEGER
);
CREATE INDEX IF NOT EXISTS support_tickets_owner ON support_tickets(account_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_telegram ON support_tickets(telegram_message_id);
CREATE TABLE IF NOT EXISTS account_notifications (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
 body TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER
);
CREATE INDEX IF NOT EXISTS notifications_owner ON account_notifications(account_id,created_at);
