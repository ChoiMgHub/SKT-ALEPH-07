PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS studies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK(unit='분'),
  initial_rule TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS study_entries (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  record_date TEXT NOT NULL,
  value INTEGER NOT NULL CHECK(value>=0 AND value<=1440),
  recorded_at TEXT NOT NULL,
  UNIQUE(study_id, record_date)
);
CREATE INDEX IF NOT EXISTS study_entries_order ON study_entries(study_id, record_date);
CREATE TABLE IF NOT EXISTS study_rule_changes (
  id TEXT PRIMARY KEY,
  study_id TEXT NOT NULL UNIQUE REFERENCES studies(id) ON DELETE CASCADE,
  before_rule TEXT NOT NULL,
  after_rule TEXT NOT NULL,
  reason TEXT NOT NULL,
  day1_entry_id TEXT NOT NULL REFERENCES study_entries(id) ON DELETE CASCADE,
  day2_entry_id TEXT NOT NULL REFERENCES study_entries(id) ON DELETE CASCADE,
  day1_snapshot_json TEXT NOT NULL,
  day2_snapshot_json TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
