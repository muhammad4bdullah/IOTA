CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  developer TEXT NOT NULL,
  description TEXT NOT NULL,
  genres TEXT NOT NULL,
  platforms TEXT NOT NULL,
  version TEXT NOT NULL,
  release_date TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  content_type TEXT,
  file_key TEXT,
  sha256 TEXT,
  cover_image TEXT,
  price REAL NOT NULL DEFAULT 0 CHECK (price = 0),
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  rights_text TEXT NOT NULL DEFAULT '',
  rights_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (rights_confirmed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS download_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  r2_upload_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address_hash TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_games_published ON games(published, updated_at);
CREATE INDEX IF NOT EXISTS idx_download_events_game ON download_events(game_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_admin_login_attempts ON admin_login_attempts(address_hash, attempted_at);
