-- Registrations cannot access any company data until email confirmation.
CREATE TABLE IF NOT EXISTS pending_signups(
 id TEXT PRIMARY KEY,
 slug TEXT NOT NULL UNIQUE,
 company TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('solo','team')),
 email TEXT NOT NULL,
 name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 expires INTEGER NOT NULL,
 created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pending_signups_expiry ON pending_signups(expires);
