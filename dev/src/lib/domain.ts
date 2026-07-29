import type {
  Attachment,
  BetRecord,
  BookmakerAccount,
  CustomData,
  HedgeGroup,
  Match,
  OddsSnapshot,
} from "../types";

// All functions are token-scoped: every query filters by token_id so one
// developer's data can never leak to another. The tokenId comes from the
// resolved bearer token (see middleware/auth.ts).

// ── matches ───────────────────────────────────────────────────────────────
export interface MatchInput {
  ext_id?: string | null;
  league?: string | null;
  season?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  kickoff_at?: number | null;
  home_score?: number | null;
  away_score?: number | null;
  status?: string;
  source?: string | null;
  notes?: string | null;
  raw?: string | null;
}

export async function listMatches(
  db: D1Database,
  tokenId: number,
  opts: { limit?: number; cursor?: number | null } = {},
): Promise<{ rows: Match[]; nextCursor: number | null }> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const where: string[] = ["token_id = ?"];
  const binds: (string | number)[] = [tokenId];
  if (opts.cursor) { where.push("id < ?"); binds.push(opts.cursor); }
  const { results } = await db
    .prepare(`SELECT * FROM matches WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`)
    .bind(...binds, limit + 1)
    .all<Match>();
  let nextCursor: number | null = null;
  if (results.length > limit) { nextCursor = results[limit - 1]!.id; results.length = limit; }
  return { rows: results, nextCursor };
}

export async function getMatch(db: D1Database, tokenId: number, id: number): Promise<Match | null> {
  return db.prepare("SELECT * FROM matches WHERE token_id = ? AND id = ?").bind(tokenId, id).first<Match>();
}

/** Idempotent write keyed on (token_id, ext_id) when ext_id is provided. */
export async function upsertMatch(db: D1Database, tokenId: number, input: MatchInput): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO matches (token_id, ext_id, league, season, home_team, away_team, kickoff_at, home_score, away_score, status, source, notes, raw, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())
       ON CONFLICT(token_id, ext_id) DO UPDATE SET league=excluded.league, season=excluded.season, home_team=excluded.home_team, away_team=excluded.away_team, kickoff_at=excluded.kickoff_at, home_score=excluded.home_score, away_score=excluded.away_score, status=excluded.status, source=excluded.source, notes=excluded.notes, raw=excluded.raw, updated_at=unixepoch()
       RETURNING id`,
    )
    .bind(
      tokenId,
      input.ext_id ?? null,
      input.league ?? null,
      input.season ?? null,
      input.home_team ?? null,
      input.away_team ?? null,
      input.kickoff_at ?? null,
      input.home_score ?? null,
      input.away_score ?? null,
      input.status ?? "scheduled",
      input.source ?? null,
      input.notes ?? null,
      input.raw ?? null,
    )
    .first<{ id: number }>();
  return row!.id;
}

export async function updateMatch(db: D1Database, tokenId: number, id: number, input: MatchInput): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE matches SET ext_id=COALESCE(?, ext_id), league=COALESCE(?, league), season=COALESCE(?, season),
        home_team=COALESCE(?, home_team), away_team=COALESCE(?, away_team), kickoff_at=COALESCE(?, kickoff_at),
        home_score=COALESCE(?, home_score), away_score=COALESCE(?, away_score), status=COALESCE(?, status),
        source=COALESCE(?, source), notes=COALESCE(?, notes), raw=COALESCE(?, raw), updated_at=unixepoch()
       WHERE token_id = ? AND id = ?`,
    )
    .bind(
      input.ext_id ?? null, input.league ?? null, input.season ?? null, input.home_team ?? null,
      input.away_team ?? null, input.kickoff_at ?? null, input.home_score ?? null, input.away_score ?? null,
      input.status ?? null, input.source ?? null, input.notes ?? null, input.raw ?? null, tokenId, id,
    )
    .run();
  return res.meta.changes > 0;
}

export async function deleteMatch(db: D1Database, tokenId: number, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM matches WHERE token_id = ? AND id = ?").bind(tokenId, id).run();
  return res.meta.changes > 0;
}

// ── bookmaker_accounts ────────────────────────────────────────────────────
export async function listAccounts(db: D1Database, tokenId: number): Promise<BookmakerAccount[]> {
  const { results } = await db
    .prepare("SELECT * FROM bookmaker_accounts WHERE token_id = ? ORDER BY id DESC")
    .bind(tokenId)
    .all<BookmakerAccount>();
  return results;
}

export async function createAccount(
  db: D1Database,
  tokenId: number,
  bookmaker: string,
  label: string | null,
  currency: string,
  balance: number,
): Promise<number> {
  const res = await db
    .prepare("INSERT INTO bookmaker_accounts (token_id, bookmaker, label, currency, balance) VALUES (?, ?, ?, ?, ?)")
    .bind(tokenId, bookmaker, label, currency, balance)
    .run();
  return Number(res.meta.last_row_id);
}

export async function deleteAccount(db: D1Database, tokenId: number, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM bookmaker_accounts WHERE token_id = ? AND id = ?").bind(tokenId, id).run();
  return res.meta.changes > 0;
}

// ── bet_records ───────────────────────────────────────────────────────────
export interface BetInput {
  match_id?: number | null;
  account_id?: number | null;
  ticket_id?: string | null;
  bookmaker?: string | null;
  market?: string | null;
  bet_side?: string | null;
  line?: number | null;
  odds?: number | null;
  stake: number;
  currency?: string;
  result?: string;
  payout?: number | null;
  profit?: number | null;
  placed_at?: number | null;
  settled_at?: number | null;
  hedge_group_id?: number | null;
  notes?: string | null;
  raw?: string | null;
}

export interface BetFilter {
  bookmaker?: string;
  market?: string;
  result?: string;
  match_id?: number;
  hedge_group_id?: number;
}

export async function listBets(
  db: D1Database,
  tokenId: number,
  filter: BetFilter = {},
  opts: { limit?: number; cursor?: number | null } = {},
): Promise<{ rows: BetRecord[]; nextCursor: number | null }> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const where: string[] = ["token_id = ?"];
  const binds: (string | number)[] = [tokenId];
  if (filter.bookmaker) { where.push("bookmaker = ?"); binds.push(filter.bookmaker); }
  if (filter.market) { where.push("market = ?"); binds.push(filter.market); }
  if (filter.result) { where.push("result = ?"); binds.push(filter.result); }
  if (filter.match_id) { where.push("match_id = ?"); binds.push(filter.match_id); }
  if (filter.hedge_group_id) { where.push("hedge_group_id = ?"); binds.push(filter.hedge_group_id); }
  if (opts.cursor) { where.push("id < ?"); binds.push(opts.cursor); }
  const { results } = await db
    .prepare(`SELECT * FROM bet_records WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`)
    .bind(...binds, limit + 1)
    .all<BetRecord>();
  let nextCursor: number | null = null;
  if (results.length > limit) { nextCursor = results[limit - 1]!.id; results.length = limit; }
  return { rows: results, nextCursor };
}
export async function getBet(db: D1Database, tokenId: number, id: number): Promise<BetRecord | null> {
  return db.prepare("SELECT * FROM bet_records WHERE token_id = ? AND id = ?").bind(tokenId, id).first<BetRecord>();
}

export async function createBet(db: D1Database, tokenId: number, input: BetInput): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO bet_records (token_id, match_id, account_id, ticket_id, bookmaker, market, bet_side, line, odds, stake, currency, result, payout, profit, placed_at, settled_at, hedge_group_id, notes, raw)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      tokenId, input.match_id ?? null, input.account_id ?? null, input.ticket_id ?? null, input.bookmaker ?? null,
      input.market ?? null, input.bet_side ?? null, input.line ?? null, input.odds ?? null, input.stake,
      input.currency ?? "CNY", input.result ?? "pending", input.payout ?? null, input.profit ?? null,
      input.placed_at ?? null, input.settled_at ?? null, input.hedge_group_id ?? null, input.notes ?? null,
      input.raw ?? null,
    )
    .run();
  return Number(res.meta.last_row_id);
}

/** Settlement update: result + payout + computed profit + settled_at. */
export async function settleBet(
  db: D1Database,
  tokenId: number,
  id: number,
  result: string,
  payout: number,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE bet_records SET result = ?, payout = ?, profit = ? - stake, settled_at = unixepoch(), updated_at = unixepoch()
       WHERE token_id = ? AND id = ?`,
    )
    .bind(result, payout, payout, tokenId, id)
    .run();
  return res.meta.changes > 0;
}

export async function updateBet(db: D1Database, tokenId: number, id: number, input: BetInput): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE bet_records SET match_id=COALESCE(?, match_id), account_id=COALESCE(?, account_id), bookmaker=COALESCE(?, bookmaker),
        market=COALESCE(?, market), bet_side=COALESCE(?, bet_side), line=COALESCE(?, line), odds=COALESCE(?, odds),
        stake=COALESCE(?, stake), result=COALESCE(?, result), hedge_group_id=COALESCE(?, hedge_group_id),
        notes=COALESCE(?, notes), updated_at=unixepoch()
       WHERE token_id = ? AND id = ?`,
    )
    .bind(
      input.match_id ?? null, input.account_id ?? null, input.bookmaker ?? null, input.market ?? null,
      input.bet_side ?? null, input.line ?? null, input.odds ?? null, input.stake, input.result ?? null,
      input.hedge_group_id ?? null, input.notes ?? null, tokenId, id,
    )
    .run();
  return res.meta.changes > 0;
}

export async function deleteBet(db: D1Database, tokenId: number, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM bet_records WHERE token_id = ? AND id = ?").bind(tokenId, id).run();
  return res.meta.changes > 0;
}

// ── P&L summary ───────────────────────────────────────────────────────────
export interface PnlSummary {
  total_bets: number;
  settled_bets: number;
  pending_bets: number;
  total_stake: number;
  settled_stake: number;
  total_profit: number;
}

export async function betPnlSummary(db: D1Database, tokenId: number): Promise<PnlSummary> {
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total_bets,
         SUM(CASE WHEN result != 'pending' THEN 1 ELSE 0 END) AS settled_bets,
         SUM(CASE WHEN result = 'pending' THEN 1 ELSE 0 END) AS pending_bets,
         COALESCE(SUM(stake), 0) AS total_stake,
         COALESCE(SUM(CASE WHEN result != 'pending' THEN stake ELSE 0 END), 0) AS settled_stake,
         COALESCE(SUM(CASE WHEN result != 'pending' THEN profit ELSE 0 END), 0) AS total_profit
       FROM bet_records WHERE token_id = ?`,
    )
    .bind(tokenId)
    .first<PnlSummary>();
  return row ?? { total_bets: 0, settled_bets: 0, pending_bets: 0, total_stake: 0, settled_stake: 0, total_profit: 0 };
}

/** Profit grouped by a dimension (bookmaker / market / result). */
export async function betProfitBy(
  db: D1Database,
  tokenId: number,
  dimension: "bookmaker" | "market" | "result",
): Promise<{ key: string; bets: number; stake: number; profit: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT ${dimension} AS key, COUNT(*) AS bets, COALESCE(SUM(stake),0) AS stake,
              COALESCE(SUM(CASE WHEN result != 'pending' THEN profit ELSE 0 END),0) AS profit
       FROM bet_records WHERE token_id = ? GROUP BY ${dimension} ORDER BY profit DESC`,
    )
    .bind(tokenId)
    .all<{ key: string; bets: number; stake: number; profit: number }>();
  return results;
}

// ── hedge_groups ──────────────────────────────────────────────────────────
export async function listHedges(db: D1Database, tokenId: number): Promise<HedgeGroup[]> {
  const { results } = await db
    .prepare("SELECT * FROM hedge_groups WHERE token_id = ? ORDER BY id DESC")
    .bind(tokenId)
    .all<HedgeGroup>();
  return results;
}

export async function createHedge(
  db: D1Database,
  tokenId: number,
  name: string | null,
  strategy: string | null,
  expectedProfit: number | null,
  totalStake: number | null,
  notes: string | null,
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO hedge_groups (token_id, name, strategy, expected_profit, total_stake, notes) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(tokenId, name, strategy, expectedProfit, totalStake, notes)
    .run();
  return Number(res.meta.last_row_id);
}

export async function deleteHedge(db: D1Database, tokenId: number, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM hedge_groups WHERE token_id = ? AND id = ?").bind(tokenId, id).run();
  return res.meta.changes > 0;
}

// ── odds_snapshots ────────────────────────────────────────────────────────
export async function listOdds(db: D1Database, tokenId: number, matchId: number): Promise<OddsSnapshot[]> {
  const { results } = await db
    .prepare("SELECT * FROM odds_snapshots WHERE token_id = ? AND match_id = ? ORDER BY captured_at DESC")
    .bind(tokenId, matchId)
    .all<OddsSnapshot>();
  return results;
}

export async function createOdds(db: D1Database, tokenId: number, input: Omit<OddsSnapshot, "id" | "token_id" | "created_at">): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO odds_snapshots (token_id, match_id, bookmaker, market, bet_side, line, odds, captured_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(tokenId, input.match_id, input.bookmaker ?? null, input.market ?? null, input.bet_side ?? null, input.line ?? null, input.odds ?? null, input.captured_at)
    .run();
  return Number(res.meta.last_row_id);
}

// ── attachments ───────────────────────────────────────────────────────────
export async function listAttachments(db: D1Database, tokenId: number, betId?: number): Promise<Attachment[]> {
  if (betId) {
    const { results } = await db
      .prepare("SELECT * FROM attachments WHERE token_id = ? AND bet_id = ? ORDER BY id DESC")
      .bind(tokenId, betId)
      .all<Attachment>();
    return results;
  }
  const { results } = await db
    .prepare("SELECT * FROM attachments WHERE token_id = ? ORDER BY id DESC LIMIT 100")
    .bind(tokenId)
    .all<Attachment>();
  return results;
}

export async function createAttachment(
  db: D1Database,
  tokenId: number,
  input: { bet_id?: number | null; match_id?: number | null; r2_key: string; filename?: string | null; content_type?: string | null; size?: number | null; kind?: string | null },
): Promise<number> {
  const res = await db
    .prepare(
      "INSERT INTO attachments (token_id, bet_id, match_id, r2_key, filename, content_type, size, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(tokenId, input.bet_id ?? null, input.match_id ?? null, input.r2_key, input.filename ?? null, input.content_type ?? null, input.size ?? null, input.kind ?? null)
    .run();
  return Number(res.meta.last_row_id);
}

export async function getAttachment(db: D1Database, tokenId: number, id: number): Promise<Attachment | null> {
  return db.prepare("SELECT * FROM attachments WHERE token_id = ? AND id = ?").bind(tokenId, id).first<Attachment>();
}


export async function deleteAttachment(db: D1Database, tokenId: number, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM attachments WHERE token_id = ? AND id = ?").bind(tokenId, id).run();
  return res.meta.changes > 0;
}

// ── admin (god-mode: sees ALL tokens' data, unscoped) ─────────────────────
export async function adminListBets(
  db: D1Database,
  opts: { bookmaker?: string; result?: string; token_id?: number; limit?: number; cursor?: number | null } = {},
): Promise<{ rows: BetRecord[]; nextCursor: number | null }> {
  const limit = Math.min(opts.limit ?? 200, 500);
  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (opts.bookmaker) { where.push("bookmaker = ?"); binds.push(opts.bookmaker); }
  if (opts.result) { where.push("result = ?"); binds.push(opts.result); }
  if (opts.token_id) { where.push("token_id = ?"); binds.push(opts.token_id); }
  if (opts.cursor) { where.push("id < ?"); binds.push(opts.cursor); }
  const sql = `SELECT * FROM bet_records ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...binds, limit + 1).all<BetRecord>();
  let nextCursor: number | null = null;
  if (results.length > limit) { nextCursor = results[limit - 1]!.id; results.length = limit; }
  return { rows: results, nextCursor };
}

export async function adminListMatches(
  db: D1Database,
  opts: { limit?: number; cursor?: number | null } = {},
): Promise<{ rows: Match[]; nextCursor: number | null }> {
  const limit = Math.min(opts.limit ?? 200, 500);
  const where: string[] = [];
  const binds: (string | number)[] = [];
  if (opts.cursor) { where.push("id < ?"); binds.push(opts.cursor); }
  const sql = `SELECT * FROM matches ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...binds, limit + 1).all<Match>();
  let nextCursor: number | null = null;
  if (results.length > limit) { nextCursor = results[limit - 1]!.id; results.length = limit; }
  return { rows: results, nextCursor };
}

export async function adminListAccounts(db: D1Database): Promise<BookmakerAccount[]> {
  const { results } = await db.prepare("SELECT * FROM bookmaker_accounts ORDER BY id DESC").all<BookmakerAccount>();
  return results;
}

export async function adminPnlSummary(db: D1Database): Promise<PnlSummary> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total_bets,
         SUM(CASE WHEN result != 'pending' THEN 1 ELSE 0 END) AS settled_bets,
         SUM(CASE WHEN result = 'pending' THEN 1 ELSE 0 END) AS pending_bets,
         COALESCE(SUM(stake), 0) AS total_stake,
         COALESCE(SUM(CASE WHEN result != 'pending' THEN stake ELSE 0 END), 0) AS settled_stake,
         COALESCE(SUM(CASE WHEN result != 'pending' THEN profit ELSE 0 END), 0) AS total_profit
       FROM bet_records`,
    )
    .first<PnlSummary>();
  return row ?? { total_bets: 0, settled_bets: 0, pending_bets: 0, total_stake: 0, settled_stake: 0, total_profit: 0 };
}

export async function adminSettleBet(db: D1Database, id: number, result: string, payout: number): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE bet_records SET result = ?, payout = ?, profit = ? - stake, settled_at = unixepoch(), updated_at = unixepoch() WHERE id = ?`,
    )
    .bind(result, payout, payout, id)
    .run();
  return res.meta.changes > 0;
}

export async function adminDeleteBet(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM bet_records WHERE id = ?").bind(id).run();
  return res.meta.changes > 0;
}

export async function adminDeleteMatch(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM matches WHERE id = ?").bind(id).run();
  return res.meta.changes > 0;
}

export async function adminDeleteAccount(db: D1Database, id: number): Promise<boolean> {
  const res = await db.prepare("DELETE FROM bookmaker_accounts WHERE id = ?").bind(id).run();
  return res.meta.changes > 0;
}

export async function adminBetProfitBy(
  db: D1Database,
  dimension: "bookmaker" | "market" | "result",
): Promise<{ key: string; bets: number; stake: number; profit: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT ${dimension} AS key, COUNT(*) AS bets, COALESCE(SUM(stake),0) AS stake,
              COALESCE(SUM(CASE WHEN result != 'pending' THEN profit ELSE 0 END),0) AS profit
       FROM bet_records GROUP BY ${dimension} ORDER BY profit DESC`,
    )
    .all<{ key: string; bets: number; stake: number; profit: number }>();
  return results;
}

// ── custom_data: generic JSON (-> D1) + blob (-> R2) store, token-isolated ─
export async function getCustomData(db: D1Database, tokenId: number, key: string): Promise<CustomData | null> {
  return db.prepare("SELECT * FROM custom_data WHERE token_id = ? AND key = ?").bind(tokenId, key).first<CustomData>();
}
export async function listCustomData(
  db: D1Database,
  tokenId: number,
  opts: { prefix?: string | null; cursor?: string | null; limit?: number } = {},
): Promise<{ rows: CustomData[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 100, 500);
  const where: string[] = ["token_id = ?"];
  const binds: (string | number)[] = [tokenId];
  if (opts.prefix) { where.push("key LIKE ?"); binds.push(`${opts.prefix}%`); }
  if (opts.cursor) { where.push("key > ?"); binds.push(opts.cursor); }
  const { results } = await db
    .prepare(`SELECT id, key, kind, content_type, size, updated_at FROM custom_data WHERE ${where.join(" AND ")} ORDER BY key LIMIT ?`)
    .bind(...binds, limit + 1)
    .all<CustomData>();
  let nextCursor: string | null = null;
  if (results.length > limit) {
    nextCursor = results[limit - 1]!.key;
    results.length = limit;
  }
  return { rows: results, nextCursor };
}

// ── batch operations on custom_data ───────────────────────────────────────
export async function batchUpsertCustomJson(
  db: D1Database,
  tokenId: number,
  items: { key: string; json: string }[],
): Promise<number> {
  if (!items.length) return 0;
  const stmts = items.map((it) =>
    db
      .prepare(
        `INSERT INTO custom_data (token_id, key, kind, content_type, size, json, updated_at)
         VALUES (?, ?, 'json', 'application/json', ?, ?, unixepoch())
         ON CONFLICT(token_id, key) DO UPDATE SET kind='json', content_type='application/json', size=excluded.size, json=excluded.json, r2_key=NULL, updated_at=unixepoch()`,
      )
      .bind(tokenId, it.key, it.json.length, it.json),
  );
  await db.batch(stmts);
  return items.length;
}
// D1 caps SQL variables per query (~100), so chunk large IN(?) lists.
const SQL_VAR_CHUNK = 50;

export async function batchGetCustomData(db: D1Database, tokenId: number, keys: string[]): Promise<CustomData[]> {
  const out: CustomData[] = [];
  for (let i = 0; i < keys.length; i += SQL_VAR_CHUNK) {
    const chunk = keys.slice(i, i + SQL_VAR_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await db
      .prepare(`SELECT * FROM custom_data WHERE token_id = ? AND key IN (${placeholders})`)
      .bind(tokenId, ...chunk)
      .all<CustomData>();
    out.push(...results);
  }
  return out;
}

/** Deletes matching rows and returns them so the caller can drop blob objects from R2. */
export async function batchDeleteCustomData(db: D1Database, tokenId: number, keys: string[]): Promise<CustomData[]> {
  const deleted: CustomData[] = [];
  for (let i = 0; i < keys.length; i += SQL_VAR_CHUNK) {
    const chunk = keys.slice(i, i + SQL_VAR_CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const { results } = await db
      .prepare(`SELECT * FROM custom_data WHERE token_id = ? AND key IN (${placeholders})`)
      .bind(tokenId, ...chunk)
      .all<CustomData>();
    if (results.length) {
      const delPh = results.map(() => "?").join(",");
      await db
        .prepare(`DELETE FROM custom_data WHERE token_id = ? AND key IN (${delPh})`)
        .bind(tokenId, ...results.map((r) => r.key))
        .run();
      deleted.push(...results);
    }
  }
  return deleted;
}

export async function upsertCustomJson(db: D1Database, tokenId: number, key: string, contentType: string, json: string, size: number): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO custom_data (token_id, key, kind, content_type, size, json, r2_key, updated_at)
       VALUES (?, ?, 'json', ?, ?, ?, NULL, unixepoch())
       ON CONFLICT(token_id, key) DO UPDATE SET kind='json', content_type=excluded.content_type, size=excluded.size, json=excluded.json, r2_key=NULL, updated_at=unixepoch()
       RETURNING id`,
    )
    .bind(tokenId, key, contentType, size, json)
    .first<{ id: number }>();
  return row!.id;
}

export async function upsertCustomBlob(db: D1Database, tokenId: number, key: string, r2Key: string, contentType: string, size: number): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO custom_data (token_id, key, kind, content_type, size, json, r2_key, updated_at)
       VALUES (?, ?, 'blob', ?, ?, NULL, ?, unixepoch())
       ON CONFLICT(token_id, key) DO UPDATE SET kind='blob', content_type=excluded.content_type, size=excluded.size, json=NULL, r2_key=excluded.r2_key, updated_at=unixepoch()
       RETURNING id`,
    )
    .bind(tokenId, key, contentType, size, r2Key)
    .first<{ id: number }>();
  return row!.id;
}

/** Deletes the index row and returns it so the caller can drop the R2 object if it was a blob. */
export async function deleteCustomData(db: D1Database, tokenId: number, key: string): Promise<CustomData | null> {
  const existing = await getCustomData(db, tokenId, key);
  if (!existing) return null;
  await db.prepare("DELETE FROM custom_data WHERE token_id = ? AND key = ?").bind(tokenId, key).run();
  return existing;
}

export async function adminListCustomData(db: D1Database, limit = 200): Promise<CustomData[]> {
  const { results } = await db
    .prepare("SELECT id, token_id, key, kind, content_type, size, updated_at FROM custom_data ORDER BY updated_at DESC LIMIT ?")
    .bind(limit)
    .all<CustomData>();
  return results;
}

export async function adminDeleteCustomData(db: D1Database, id: number): Promise<CustomData | null> {
  const row = await db.prepare("SELECT * FROM custom_data WHERE id = ?").bind(id).first<CustomData>();
  if (!row) return null;
  await db.prepare("DELETE FROM custom_data WHERE id = ?").bind(id).run();
  return row;
}