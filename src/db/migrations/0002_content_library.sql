CREATE TABLE IF NOT EXISTS content_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'instagram',
  handle TEXT NOT NULL,
  name TEXT,
  bio TEXT,
  followers INTEGER,
  posts INTEGER,
  role TEXT NOT NULL DEFAULT 'referencia',
  notes TEXT,
  median_views INTEGER,
  last_mapped_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS content_accounts_handle_unique ON content_accounts (platform, handle);

CREATE TABLE IF NOT EXISTS content_pieces (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES content_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'instagram',
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'reel',
  posted_at TEXT,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  duration_seconds INTEGER,
  caption TEXT,
  transcript TEXT,
  hook TEXT,
  fit INTEGER NOT NULL DEFAULT 0,
  fit_reason TEXT,
  performance REAL,
  starred INTEGER NOT NULL DEFAULT 0,
  media_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS content_pieces_external_unique ON content_pieces (platform, external_id);

CREATE INDEX IF NOT EXISTS content_pieces_account ON content_pieces (account_id);
