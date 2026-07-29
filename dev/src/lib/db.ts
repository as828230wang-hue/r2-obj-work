import { hashPassword } from "./crypto";
import type { AdminUser, ApiToken, AppBindings } from "../types";

// D1's db.exec() splits on newlines, which breaks multi-line statements, so
// each statement is one line and we run them via db.batch().
const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()))",
  "CREATE TABLE IF NOT EXISTS api_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, permissions TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (unixepoch()), last_used_at INTEGER)",
  "CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash)",
  "CREATE INDEX IF NOT EXISTS idx_api_tokens_active ON api_tokens(active)",
  // ── betting-ledger (token-isolated) ──────────────────────────────────────
  "CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY AUTOINCREMENT, token_id INTEGER NOT NULL, ext_id TEXT, league TEXT, season TEXT, home_team TEXT, away_team TEXT, kickoff_at INTEGER, home_score INTEGER, away_score INTEGER, status TEXT NOT NULL DEFAULT 'scheduled', source TEXT, notes TEXT, raw TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), UNIQUE (token_id, ext_id))",
  "CREATE INDEX IF NOT EXISTS idx_matches_token_kickoff ON matches (token_id, kickoff_at)",
  "CREATE INDEX IF NOT EXISTS idx_matches_token_ext ON matches (token_id, ext_id)",
  "CREATE TABLE IF NOT EXISTS bookmaker_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, token_id INTEGER NOT NULL, bookmaker TEXT NOT NULL, label TEXT, currency TEXT NOT NULL DEFAULT 'CNY', balance REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))",
  "CREATE INDEX IF NOT EXISTS idx_accounts_token ON bookmaker_accounts (token_id)",
  "CREATE TABLE IF NOT EXISTS bet_records (id INTEGER PRIMARY KEY AUTOINCREMENT, token_id INTEGER NOT NULL, match_id INTEGER, account_id INTEGER, ticket_id TEXT, bookmaker TEXT, market TEXT, bet_side TEXT, line REAL, odds REAL, stake REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'CNY', result TEXT NOT NULL DEFAULT 'pending', payout REAL, profit REAL, placed_at INTEGER, settled_at INTEGER, hedge_group_id INTEGER, notes TEXT, raw TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))",
  "CREATE INDEX IF NOT EXISTS idx_bets_token_placed ON bet_records (token_id, placed_at)",
  "CREATE INDEX IF NOT EXISTS idx_bets_token_match ON bet_records (token_id, match_id)",
  "CREATE INDEX IF NOT EXISTS idx_bets_token_bookmaker ON bet_records (token_id, bookmaker)",
  "CREATE INDEX IF NOT EXISTS idx_bets_token_result ON bet_records (token_id, result)",
  "CREATE INDEX IF NOT EXISTS idx_bets_token_hedge ON bet_records (token_id, hedge_group_id)",
  "CREATE TABLE IF NOT EXISTS odds_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, token_id INTEGER NOT NULL, match_id INTEGER NOT NULL, bookmaker TEXT, market TEXT, bet_side TEXT, line REAL, odds REAL, captured_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()))",
  "CREATE INDEX IF NOT EXISTS idx_odds_token_match ON odds_snapshots (token_id, match_id)",
  "CREATE TABLE IF NOT EXISTS hedge_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, token_id INTEGER NOT NULL, name TEXT, strategy TEXT, status TEXT NOT NULL DEFAULT 'open', expected_profit REAL, total_stake REAL, notes TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))",
  "CREATE INDEX IF NOT EXISTS idx_hedge_token ON hedge_groups (token_id)",
  "CREATE TABLE IF NOT EXISTS attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, token_id INTEGER NOT NULL, bet_id INTEGER, match_id INTEGER, r2_key TEXT NOT NULL, filename TEXT, content_type TEXT, size INTEGER, kind TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))",
  "CREATE INDEX IF NOT EXISTS idx_attach_token_bet ON attachments (token_id, bet_id)",
  "CREATE TABLE IF NOT EXISTS custom_data (id INTEGER PRIMARY KEY AUTOINCREMENT, token_id INTEGER NOT NULL, key TEXT NOT NULL, kind TEXT NOT NULL, content_type TEXT, size INTEGER, json TEXT, r2_key TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), UNIQUE (token_id, key))",
  "CREATE INDEX IF NOT EXISTS idx_custom_token_key ON custom_data (token_id, key)",
];

let schemaPromise: Promise<void> | null = null;

/** Idempotent: runs the schema once per isolate. Safe to call repeatedly. */
export function ensureSchema(db: D1Database): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = db
    .batch(SCHEMA_STATEMENTS.map((stmt) => db.prepare(stmt)))
    .then(() => undefined)
    .catch((err) => {
      schemaPromise = null; // allow retry on failure
      throw err;
    });
  return schemaPromise;
}

/** Per-isolate bootstrap: schema + seed admin. */
let initPromise: Promise<void> | null = null;
export function initStore(env: AppBindings): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await ensureSchema(env.DB);
    if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD) {
      await ensureSeedAdmin(env.DB, env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
    }
  })().catch((err) => {
    initPromise = null;
    throw err;
  });
  return initPromise;
}

// ── Admin users ───────────────────────────────────────────────────────────
export async function ensureSeedAdmin(db: D1Database, username: string, password: string): Promise<void> {
  const existing = await getAdminByUsername(db, username);
  if (existing) return;
  const hash = await hashPassword(password);
  await db.prepare("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)").bind(username, hash).run();
}

export async function getAdminByUsername(db: D1Database, username: string): Promise<AdminUser | null> {
  return db.prepare("SELECT * FROM admin_users WHERE username = ?").bind(username).first<AdminUser>();
}

// ── API tokens ────────────────────────────────────────────────────────────
export async function listTokens(db: D1Database): Promise<ApiToken[]> {
  const { results } = await db.prepare("SELECT * FROM api_tokens ORDER BY id DESC").all<ApiToken>();
  return results;
}

export async function getAdminById(db: D1Database, id: number): Promise<AdminUser | null> {
  return db.prepare("SELECT * FROM admin_users WHERE id = ?").bind(id).first<AdminUser>();
}

export async function updateAdminPassword(db: D1Database, id: number, passwordHash: string): Promise<void> {
  await db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").bind(passwordHash, id).run();
}

export async function getTokenByHash(db: D1Database, hash: string): Promise<ApiToken | null> {
  return db
    .prepare("SELECT * FROM api_tokens WHERE token_hash = ? AND active = 1")
    .bind(hash)
    .first<ApiToken>();
}

export async function createToken(
  db: D1Database,
  name: string,
  tokenHash: string,
  permissions: string[],
): Promise<number> {
  const res = await db
    .prepare("INSERT INTO api_tokens (name, token_hash, permissions) VALUES (?, ?, ?)")
    .bind(name, tokenHash, JSON.stringify(permissions))
    .run();
  return Number(res.meta.last_row_id);
}

export async function revokeToken(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE api_tokens SET active = 0 WHERE id = ?").bind(id).run();
}

export async function touchToken(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE api_tokens SET last_used_at = unixepoch() WHERE id = ?").bind(id).run();
}
