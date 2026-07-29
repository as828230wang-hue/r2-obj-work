-- Betting-ledger schema (token-isolated). Additive to 0001_init.sql.
-- Every domain table carries token_id for per-developer isolation.

-- 赛事
CREATE TABLE IF NOT EXISTS matches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id    INTEGER NOT NULL,
  ext_id      TEXT,
  league      TEXT,
  season      TEXT,
  home_team   TEXT,
  away_team   TEXT,
  kickoff_at  INTEGER,
  home_score  INTEGER,
  away_score  INTEGER,
  status      TEXT NOT NULL DEFAULT 'scheduled',
  source      TEXT,
  notes       TEXT,
  raw         TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (token_id, ext_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_token_kickoff ON matches (token_id, kickoff_at);
CREATE INDEX IF NOT EXISTS idx_matches_token_ext     ON matches (token_id, ext_id);

-- 账号 / 资金池
CREATE TABLE IF NOT EXISTS bookmaker_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id    INTEGER NOT NULL,
  bookmaker   TEXT NOT NULL,
  label       TEXT,
  currency    TEXT NOT NULL DEFAULT 'CNY',
  balance     REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_accounts_token ON bookmaker_accounts (token_id);

-- 投注记录（核心）
CREATE TABLE IF NOT EXISTS bet_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id       INTEGER NOT NULL,
  match_id       INTEGER,
  account_id     INTEGER,
  ticket_id      TEXT,
  bookmaker      TEXT,
  market         TEXT,
  bet_side       TEXT,
  line           REAL,
  odds           REAL,
  stake          REAL NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'CNY',
  result         TEXT NOT NULL DEFAULT 'pending',
  payout         REAL,
  profit         REAL,
  placed_at      INTEGER,
  settled_at     INTEGER,
  hedge_group_id INTEGER,
  notes          TEXT,
  raw            TEXT,
  created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_bets_token_placed   ON bet_records (token_id, placed_at);
CREATE INDEX IF NOT EXISTS idx_bets_token_match     ON bet_records (token_id, match_id);
CREATE INDEX IF NOT EXISTS idx_bets_token_bookmaker ON bet_records (token_id, bookmaker);
CREATE INDEX IF NOT EXISTS idx_bets_token_result    ON bet_records (token_id, result);
CREATE INDEX IF NOT EXISTS idx_bets_token_hedge     ON bet_records (token_id, hedge_group_id);

-- 赛前赔率快照
CREATE TABLE IF NOT EXISTS odds_snapshots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id    INTEGER NOT NULL,
  match_id    INTEGER NOT NULL,
  bookmaker   TEXT,
  market      TEXT,
  bet_side    TEXT,
  line        REAL,
  odds        REAL,
  captured_at INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_odds_token_match ON odds_snapshots (token_id, match_id);

-- 对冲配对
CREATE TABLE IF NOT EXISTS hedge_groups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id        INTEGER NOT NULL,
  name            TEXT,
  strategy        TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  expected_profit REAL,
  total_stake     REAL,
  notes           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_hedge_token ON hedge_groups (token_id);

-- R2 附件索引（实际文件在 R2，按 token 命名空间）
CREATE TABLE IF NOT EXISTS attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id     INTEGER NOT NULL,
  bet_id       INTEGER,
  match_id     INTEGER,
  r2_key       TEXT NOT NULL,
  filename     TEXT,
  content_type TEXT,
  size         INTEGER,
  kind         TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_attach_token_bet ON attachments (token_id, bet_id);
