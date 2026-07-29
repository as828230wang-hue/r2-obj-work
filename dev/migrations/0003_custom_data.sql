-- Generic custom-data store: arbitrary JSON (-> D1) or blobs (-> R2),
-- keyed + idempotent, token-isolated. One /api/data endpoint serves both;
-- Content-Type decides the backend.
CREATE TABLE IF NOT EXISTS custom_data (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id     INTEGER NOT NULL,
  key          TEXT NOT NULL,
  kind         TEXT NOT NULL,          -- 'json' | 'blob'
  content_type TEXT,
  size         INTEGER,
  json         TEXT,                   -- populated when kind = 'json'
  r2_key       TEXT,                   -- populated when kind = 'blob'
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (token_id, key)
);
CREATE INDEX IF NOT EXISTS idx_custom_token_key ON custom_data (token_id, key);
