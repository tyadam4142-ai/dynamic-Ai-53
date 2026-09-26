PRAGMA foreign_keys = ON;

-- MIGRATION for a database created before v3.3.0 (self-serve passwords + daily credits):
-- run this once against an EXISTING D1 database (safe to skip on a brand-new one,
-- since CREATE TABLE below already includes the column):
--   ALTER TABLE accounts ADD COLUMN password_hash TEXT;

CREATE TABLE IF NOT EXISTS accounts (
  phone TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'free',
  approved INTEGER NOT NULL DEFAULT 0,
  password_hash TEXT,
  access_code_hash TEXT,
  access_code_hint TEXT,
  device_id TEXT,
  session_hash TEXT,
  session_expires_at TEXT,
  expires_at TEXT,
  monthly_tokens INTEGER,
  remaining_tokens INTEGER,
  month_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  tier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_phone ON subscription_requests(phone);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_status ON subscription_requests(status);

CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  project TEXT NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_phone_time ON usage(phone, created_at);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  project TEXT NOT NULL,
  architecture TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL,
  audit_summary TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(phone, project)
);
CREATE INDEX IF NOT EXISTS idx_projects_phone ON projects(phone);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_log_time ON audit_log(created_at);
