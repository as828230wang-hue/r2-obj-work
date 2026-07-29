import { hashPassword } from "./crypto";
import type { AdminUser, ApiToken, AppBindings } from "../types";

// D1's db.exec() splits on newlines, which breaks multi-line statements, so
// each statement is one line and we run them via db.batch().
const SCHEMA_STATEMENTS = [
  "CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()))",
  "CREATE TABLE IF NOT EXISTS api_tokens (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, permissions TEXT NOT NULL DEFAULT '[]', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (unixepoch()), last_used_at INTEGER)",
  "CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash)",
  "CREATE INDEX IF NOT EXISTS idx_api_tokens_active ON api_tokens(active)",
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
