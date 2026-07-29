import { Hono, type Context } from "hono";
import type { AppEnv } from "../types";
import { requireToken } from "../middleware/auth";
import {
  batchDeleteCustomData,
  batchGetCustomData,
  batchUpsertCustomJson,
  deleteCustomData,
  getCustomData,
  listCustomData,
  upsertCustomBlob,
  upsertCustomJson,
  betPnlSummary,
  betProfitBy,
  createAccount,
  createAttachment,
  createBet,
  createHedge,
  createOdds,
  deleteAccount,
  deleteAttachment,
  deleteBet,
  deleteHedge,
  deleteMatch,
  getAttachment,
  getBet,
  getMatch,
  listAccounts,
  listAttachments,
  listBets,
  listHedges,
  listMatches,
  listOdds,
  settleBet,
  updateBet,
  updateMatch,
  upsertMatch,
  type BetInput,
  type MatchInput,
} from "../lib/domain";

export const api = new Hono<AppEnv>();

// ── matches ───────────────────────────────────────────────────────────────
api.get("/matches", requireToken("matches:read"), async (c) => {
  const { rows, nextCursor } = await listMatches(c.env.DB, c.get("tokenId"), {
    limit: Number(c.req.query("limit")) || 100,
    cursor: c.req.query("cursor") ? Number(c.req.query("cursor")) : null,
  });
  return c.json({ matches: rows, next_cursor: nextCursor });
});

api.post("/matches", requireToken("matches:write"), async (c) => {
  const body = (await c.req.json()) as MatchInput;
  const id = await upsertMatch(c.env.DB, c.get("tokenId"), body);
  return c.json({ id }, 201);
});

api.get("/matches/:id", requireToken("matches:read"), async (c) => {
  const match = await getMatch(c.env.DB, c.get("tokenId"), Number(c.req.param("id")));
  return match ? c.json({ match }) : c.json({ error: "not found" }, 404);
});

api.put("/matches/:id", requireToken("matches:write"), async (c) => {
  const body = (await c.req.json()) as MatchInput;
  const ok = await updateMatch(c.env.DB, c.get("tokenId"), Number(c.req.param("id")), body);
  return ok ? c.json({ updated: true }) : c.json({ error: "not found" }, 404);
});
api.get("/bets", requireToken("bets:read"), async (c) => {
  const q = (k: string) => c.req.query(k);
  const { rows, nextCursor } = await listBets(
    c.env.DB,
    c.get("tokenId"),
    {
      bookmaker: q("bookmaker") || undefined,
      market: q("market") || undefined,
      result: q("result") || undefined,
      match_id: q("match_id") ? Number(q("match_id")) : undefined,
      hedge_group_id: q("hedge_group_id") ? Number(q("hedge_group_id")) : undefined,
    },
    { limit: Math.min(Number(q("limit")) || 100, 500), cursor: q("cursor") ? Number(q("cursor")) : null },
  );
  return c.json({ bets: rows, next_cursor: nextCursor });
});

api.post("/bets", requireToken("bets:write"), async (c) => {
  const body = (await c.req.json()) as BetInput;
  if (!body.stake || body.stake <= 0) return c.json({ error: "stake required and must be > 0" }, 400);
  const id = await createBet(c.env.DB, c.get("tokenId"), body);
  return c.json({ id }, 201);
});

api.get("/bets/:id", requireToken("bets:read"), async (c) => {
  const bet = await getBet(c.env.DB, c.get("tokenId"), Number(c.req.param("id")));
  return bet ? c.json({ bet }) : c.json({ error: "not found" }, 404);
});

api.put("/bets/:id", requireToken("bets:write"), async (c) => {
  const body = (await c.req.json()) as BetInput;
  const ok = await updateBet(c.env.DB, c.get("tokenId"), Number(c.req.param("id")), body);
  return ok ? c.json({ updated: true }) : c.json({ error: "not found" }, 404);
});

api.post("/bets/:id/settle", requireToken("bets:write"), async (c) => {
  const { result, payout } = (await c.req.json()) as { result: string; payout: number };
  if (!result || typeof payout !== "number") return c.json({ error: "result and payout required" }, 400);
  const ok = await settleBet(c.env.DB, c.get("tokenId"), Number(c.req.param("id")), result, payout);
  return ok ? c.json({ settled: true }) : c.json({ error: "not found" }, 404);
});

api.delete("/bets/:id", requireToken("bets:write"), async (c) => {
  const ok = await deleteBet(c.env.DB, c.get("tokenId"), Number(c.req.param("id")));
  return ok ? c.json({ deleted: true }) : c.json({ error: "not found" }, 404);
});

// ── stats / P&L ───────────────────────────────────────────────────────────
api.get("/stats/summary", requireToken("bets:read"), async (c) => {
  return c.json(await betPnlSummary(c.env.DB, c.get("tokenId")));
});

api.get("/stats/by", requireToken("bets:read"), async (c) => {
  const dimension = (c.req.query("dimension") as "bookmaker" | "market" | "result") || "bookmaker";
  if (!["bookmaker", "market", "result"].includes(dimension)) {
    return c.json({ error: "dimension must be bookmaker|market|result" }, 400);
  }
  return c.json({ dimension, rows: await betProfitBy(c.env.DB, c.get("tokenId"), dimension) });
});

// ── bookmaker accounts ────────────────────────────────────────────────────
api.get("/accounts", requireToken("bets:read"), async (c) => {
  return c.json({ accounts: await listAccounts(c.env.DB, c.get("tokenId")) });
});

api.post("/accounts", requireToken("bets:write"), async (c) => {
  const { bookmaker, label, currency, balance } = (await c.req.json()) as {
    bookmaker: string; label?: string; currency?: string; balance?: number;
  };
  if (!bookmaker) return c.json({ error: "bookmaker required" }, 400);
  const id = await createAccount(c.env.DB, c.get("tokenId"), bookmaker, label ?? null, currency ?? "CNY", balance ?? 0);
  return c.json({ id }, 201);
});

api.delete("/accounts/:id", requireToken("bets:write"), async (c) => {
  const ok = await deleteAccount(c.env.DB, c.get("tokenId"), Number(c.req.param("id")));
  return ok ? c.json({ deleted: true }) : c.json({ error: "not found" }, 404);
});

// ── hedge groups ──────────────────────────────────────────────────────────
api.get("/hedges", requireToken("bets:read"), async (c) => {
  return c.json({ hedges: await listHedges(c.env.DB, c.get("tokenId")) });
});

api.post("/hedges", requireToken("bets:write"), async (c) => {
  const b = (await c.req.json()) as { name?: string; strategy?: string; expected_profit?: number; total_stake?: number; notes?: string };
  const id = await createHedge(c.env.DB, c.get("tokenId"), b.name ?? null, b.strategy ?? null, b.expected_profit ?? null, b.total_stake ?? null, b.notes ?? null);
  return c.json({ id }, 201);
});

api.delete("/hedges/:id", requireToken("bets:write"), async (c) => {
  const ok = await deleteHedge(c.env.DB, c.get("tokenId"), Number(c.req.param("id")));
  return ok ? c.json({ deleted: true }) : c.json({ error: "not found" }, 404);
});

// ── odds snapshots ────────────────────────────────────────────────────────
api.get("/odds", requireToken("matches:read"), async (c) => {
  const matchId = Number(c.req.query("match_id"));
  if (!matchId) return c.json({ error: "match_id required" }, 400);
  return c.json({ odds: await listOdds(c.env.DB, c.get("tokenId"), matchId) });
});

api.post("/odds", requireToken("matches:write"), async (c) => {
  const b = (await c.req.json()) as { match_id: number; bookmaker?: string; market?: string; bet_side?: string; line?: number; odds?: number; captured_at: number };
  if (!b.match_id || !b.captured_at) return c.json({ error: "match_id and captured_at required" }, 400);
  const id = await createOdds(c.env.DB, c.get("tokenId"), {
    match_id: b.match_id, bookmaker: b.bookmaker ?? null, market: b.market ?? null,
    bet_side: b.bet_side ?? null, line: b.line ?? null, odds: b.odds ?? null, captured_at: b.captured_at,
  });
  return c.json({ id }, 201);
});

// ── attachments (R2, token-namespaced) ────────────────────────────────────
api.get("/attachments", requireToken("bets:read"), async (c) => {
  const betId = c.req.query("bet_id") ? Number(c.req.query("bet_id")) : undefined;
  return c.json({ attachments: await listAttachments(c.env.DB, c.get("tokenId"), betId) });
});

api.post("/attachments", requireToken("bets:write"), async (c) => {
  const tokenId = c.get("tokenId");
  const filename = c.req.query("filename") || "file";
  const betId = c.req.query("bet_id") ? Number(c.req.query("bet_id")) : null;
  const matchId = c.req.query("match_id") ? Number(c.req.query("match_id")) : null;
  const kind = c.req.query("kind") || "slip";
  const contentType = c.req.header("content-type") || "application/octet-stream";
  const body = await c.req.arrayBuffer();
  // Namespace by token so one developer can never touch another's objects.
  const r2Key = `${tokenId}/attachments/${Date.now()}-${encodeURIComponent(filename)}`;
  await c.env.BUCKET.put(r2Key, body, { httpMetadata: { contentType } });
  const id = await createAttachment(c.env.DB, tokenId, {
    bet_id: betId, match_id: matchId, r2_key: r2Key, filename, content_type: contentType, size: body.byteLength, kind,
  });
  return c.json({ id, r2_key: r2Key, size: body.byteLength }, 201);
});

api.get("/attachments/:id", requireToken("bets:read"), async (c) => {
  const att = await getAttachment(c.env.DB, c.get("tokenId"), Number(c.req.param("id")));
  if (!att) return c.json({ error: "not found" }, 404);
  const obj = await c.env.BUCKET.get(att.r2_key);
  if (!obj) return c.json({ error: "object missing in R2" }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(att.filename || "file")}"`);
  return new Response(obj.body, { headers });
});

api.delete("/attachments/:id", requireToken("bets:write"), async (c) => {
  const tokenId = c.get("tokenId");
  const att = await getAttachment(c.env.DB, tokenId, Number(c.req.param("id")));
  if (!att) return c.json({ error: "not found" }, 404);
  await c.env.BUCKET.delete(att.r2_key);
  await deleteAttachment(c.env.DB, tokenId, att.id);
  return c.json({ deleted: true });
});

// ── custom data: generic JSON (-> D1) or blob (-> R2), decided by Content-Type
function isJsonType(ct: string): boolean {
  return /json/i.test(ct);
}

async function upsertData(c: Context<AppEnv>): Promise<Response> {
  const tokenId = c.get("tokenId");
  const key = c.req.query("key");
  if (!key) return c.json({ error: "missing ?key=" }, 400);
  const contentType = c.req.header("content-type") || "application/octet-stream";
  if (isJsonType(contentType)) {
    // Overwriting a blob with json orphans its R2 object — drop it.
    const existing = await getCustomData(c.env.DB, tokenId, key);
    if (existing?.kind === "blob" && existing.r2_key) await c.env.BUCKET.delete(existing.r2_key);
    const text = await c.req.text();
    const id = await upsertCustomJson(c.env.DB, tokenId, key, contentType, text, text.length);
    return c.json({ id, key, kind: "json", size: text.length });
  }
  const body = await c.req.arrayBuffer();
  const r2Key = `${tokenId}/data/${encodeURIComponent(key)}`;
  await c.env.BUCKET.put(r2Key, body, { httpMetadata: { contentType } });
  const id = await upsertCustomBlob(c.env.DB, tokenId, key, r2Key, contentType, body.byteLength);
  return c.json({ id, key, kind: "blob", r2_key: r2Key, size: body.byteLength });
}

api.put("/data", requireToken("data:write"), upsertData);
api.post("/data", requireToken("data:write"), upsertData);

api.get("/data", requireToken("data:read"), async (c) => {
  const tokenId = c.get("tokenId");
  const key = c.req.query("key");
  if (key) {
    const row = await getCustomData(c.env.DB, tokenId, key);
    if (!row) return c.json({ error: "not found" }, 404);
    if (row.kind === "json") {
      return new Response(row.json ?? "null", {
        headers: { "content-type": row.content_type || "application/json", "cache-control": "no-store" },
      });
    }
    const obj = await c.env.BUCKET.get(row.r2_key ?? "");
    if (!obj) return c.json({ error: "object missing in R2" }, 404);
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    return new Response(obj.body, { headers });
  }
  const { rows, nextCursor } = await listCustomData(c.env.DB, tokenId, {
    prefix: c.req.query("prefix") || null,
    cursor: c.req.query("cursor") || null,
    limit: Number(c.req.query("limit")) || 100,
  });
  return c.json({ data: rows, next_cursor: nextCursor });
});

api.delete("/data", requireToken("data:write"), async (c) => {
  const tokenId = c.get("tokenId");
  const key = c.req.query("key");
  if (!key) return c.json({ error: "missing ?key=" }, 400);
  const row = await deleteCustomData(c.env.DB, tokenId, key);
  if (!row) return c.json({ error: "not found" }, 404);
  if (row.kind === "blob" && row.r2_key) await c.env.BUCKET.delete(row.r2_key);
  return c.json({ deleted: true });
});

// ── batch: bulk JSON upsert / multi-get / bulk delete ─────────────────────
const BATCH_MAX = 100;

api.post("/data/batch", requireToken("data:write"), async (c) => {
  const tokenId = c.get("tokenId");
  const body = (await c.req.json()) as { items?: { key: string; data?: unknown }[] };
  const items = (body.items ?? []).filter((it) => it && typeof it.key === "string").slice(0, BATCH_MAX);
  if (!items.length) return c.json({ error: "items[] required" }, 400);
  const payload = items.map((it) => ({ key: it.key, json: JSON.stringify(it.data ?? null) }));
  const n = await batchUpsertCustomJson(c.env.DB, tokenId, payload);
  return c.json({ upserted: n, keys: items.map((i) => i.key) });
});

api.post("/data/batch/get", requireToken("data:read"), async (c) => {
  const tokenId = c.get("tokenId");
  const body = (await c.req.json()) as { keys?: string[] };
  const keys = (body.keys ?? []).filter((k): k is string => typeof k === "string").slice(0, BATCH_MAX);
  if (!keys.length) return c.json({ error: "keys[] required" }, 400);
  return c.json({ items: await batchGetCustomData(c.env.DB, tokenId, keys) });
});

api.post("/data/batch/delete", requireToken("data:write"), async (c) => {
  const tokenId = c.get("tokenId");
  const body = (await c.req.json()) as { keys?: string[] };
  const keys = (body.keys ?? []).filter((k): k is string => typeof k === "string").slice(0, BATCH_MAX);
  if (!keys.length) return c.json({ error: "keys[] required" }, 400);
  const deleted = await batchDeleteCustomData(c.env.DB, tokenId, keys);
  const blobs = deleted.filter((r) => r.kind === "blob" && r.r2_key);
  await Promise.all(blobs.map((r) => c.env.BUCKET.delete(r.r2_key!)));
  return c.json({ deleted: deleted.length, blobs_cleaned: blobs.length });
});
