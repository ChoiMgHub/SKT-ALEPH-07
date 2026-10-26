-- Apply AFTER schema.sql. This migration is repeatable; it never assigns old records to a stranger.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS plan_owners (
  plan_id TEXT PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS plan_owners_user ON plan_owners(user_id);
CREATE TABLE IF NOT EXISTS auth_attempts (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_digest TEXT NOT NULL,
  counts_json TEXT NOT NULL,
  source_json TEXT NOT NULL,
  mappings_json TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  UNIQUE(user_id, source_digest)
);
