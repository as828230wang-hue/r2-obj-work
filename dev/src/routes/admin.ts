import { Hono } from "hono";
import type { AppEnv } from "../types";
import { marked } from "marked";
import { page } from "../views/layout";
import { requireAdmin } from "../middleware/auth";
import { createToken, getAdminById, getAdminByUsername, listTokens, revokeToken, updateAdminPassword } from "../lib/db";
import {
  adminDeleteCustomData,
  adminListCustomData,
  adminBetProfitBy,
  adminDeleteAccount,
  adminDeleteBet,
  adminDeleteMatch,
  adminListAccounts,
  adminListBets,
  adminListMatches,
  adminPnlSummary,
  adminSettleBet,
} from "../lib/domain";
import { generateToken, hashPassword, sha256hex, verifyPassword } from "../lib/crypto";
import { endSession, startSession } from "../lib/session";
import { loginView } from "../views/login";
import { dashboardView } from "../views/dashboard";
import { betsView } from "../views/bets";
import { matchesView } from "../views/matches";
import { accountsView } from "../views/accounts";
import { dataView } from "../views/data";
import { tokenCreatedView } from "../views/tokenCreated";

const FLASH_OK: Record<string, string> = {
  settled: "投注已结算",
  deleted: "记录已删除",
  revoked: "令牌已停用",
  password: "密码已修改",
};
const FLASH_ERR: Record<string, string> = {
  pw_short: "新密码至少 8 位",
  pw_mismatch: "两次输入的新密码不一致",
  pw_wrong: "当前密码错误",
};

export const admin = new Hono<AppEnv>();

// ── public auth ────────────────────────────────────────────────────────────
admin.get("/login", (c) => c.html(loginView()));

admin.post("/login", async (c) => {
  const fd = await c.req.formData();
  const username = String(fd.get("username") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const user = await getAdminByUsername(c.env.DB, username);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.html(loginView("用户名或密码错误"), 401);
  }
  await startSession(c, user.id, user.username);
  return c.redirect("/admin");
});

admin.all("/logout", (c) => {
  endSession(c);
  return c.redirect("/admin/login");
});

admin.use("/*", requireAdmin);

// ── API documentation (server-rendered from assets/api-doc.md) ─────────────
admin.get("/docs", async (c) => {
  const res = await c.env.ASSETS.fetch(new Request(new URL("/api-doc.md", c.req.url)));
  if (!res.ok) return c.text("documentation not found", 404);
  const html = await marked.parse(await res.text());
  return c.html(page("API 文档", `<main class="docs">${html}</main>`));
});

// ── dashboard ───────────────────────────────────────────────────────────────
admin.get("/", async (c) => {
  const summary = await adminPnlSummary(c.env.DB);
  const byBookmaker = await adminBetProfitBy(c.env.DB, "bookmaker");
  const recent = (await adminListBets(c.env.DB, { limit: 15 })).rows;
  const tokens = await listTokens(c.env.DB);
  const done = c.req.query("done") ?? "";
  const flash = FLASH_OK[done]
    ? { type: "ok" as const, msg: FLASH_OK[done] }
    : FLASH_ERR[done]
      ? { type: "error" as const, msg: FLASH_ERR[done] }
      : undefined;
  return c.html(dashboardView({ admin: c.get("admin"), summary, byBookmaker, recent, tokens, flash }));
});

// ── bets ────────────────────────────────────────────────────────────────────
admin.get("/bets", async (c) => {
  const q = (k: string) => c.req.query(k);
  const { rows: bets, nextCursor } = await adminListBets(c.env.DB, {
    bookmaker: q("bookmaker") || undefined,
    result: q("result") || undefined,
    token_id: q("token_id") ? Number(q("token_id")) : undefined,
    limit: 200,
    cursor: q("cursor") ? Number(q("cursor")) : null,
  });
  const tokens = await listTokens(c.env.DB);
  return c.html(betsView({ bets, tokens, nextCursor, filters: { bookmaker: q("bookmaker") ?? "", result: q("result") ?? "", token_id: q("token_id") ?? "" } }));
});

admin.post("/bets/:id/settle", async (c) => {
  const fd = await c.req.formData();
  const result = String(fd.get("result") ?? "");
  const payout = Number(fd.get("payout") ?? "0");
  if (result && !Number.isNaN(payout)) {
    await adminSettleBet(c.env.DB, Number(c.req.param("id")), result, payout);
  }
  return c.redirect("/admin/bets?done=settled");
});

admin.post("/bets/:id/delete", async (c) => {
  await adminDeleteBet(c.env.DB, Number(c.req.param("id")));
  return c.redirect("/admin/bets?done=deleted");
});

// ── matches ─────────────────────────────────────────────────────────────────
admin.get("/matches", async (c) => {
  const cursor = c.req.query("cursor") ? Number(c.req.query("cursor")) : null;
  const { rows: matches, nextCursor } = await adminListMatches(c.env.DB, { limit: 200, cursor });
  const tokens = await listTokens(c.env.DB);
  return c.html(matchesView({ matches, tokens, nextCursor }));
});

admin.post("/matches/:id/delete", async (c) => {
  await adminDeleteMatch(c.env.DB, Number(c.req.param("id")));
  return c.redirect("/admin/matches?done=deleted");
});

// ── accounts ────────────────────────────────────────────────────────────────
admin.get("/accounts", async (c) => {
  const accounts = await adminListAccounts(c.env.DB);
  const tokens = await listTokens(c.env.DB);
  return c.html(accountsView({ accounts, tokens }));
});

admin.post("/accounts/:id/delete", async (c) => {
  await adminDeleteAccount(c.env.DB, Number(c.req.param("id")));
  return c.redirect("/admin/accounts?done=deleted");
});

// ── custom data ─────────────────────────────────────────────────────────────
admin.get("/data", async (c) => {
  const rows = await adminListCustomData(c.env.DB);
  const tokens = await listTokens(c.env.DB);
  return c.html(dataView({ rows, tokens }));
});

admin.post("/data/:id/delete", async (c) => {
  const row = await adminDeleteCustomData(c.env.DB, Number(c.req.param("id")));
  if (row?.kind === "blob" && row.r2_key) await c.env.BUCKET.delete(row.r2_key);
  return c.redirect("/admin/data?done=deleted");
});

// ── account / password ──────────────────────────────────────────────────────
admin.post("/password", async (c) => {
  const fd = await c.req.formData();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("new") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (next.length < 8) return c.redirect("/admin?done=pw_short");
  if (next !== confirm) return c.redirect("/admin?done=pw_mismatch");
  const a = c.get("admin");
  const user = await getAdminById(c.env.DB, a.id);
  if (!user || !(await verifyPassword(current, user.password_hash))) {
    return c.redirect("/admin?done=pw_wrong");
  }
  await updateAdminPassword(c.env.DB, a.id, await hashPassword(next));
  return c.redirect("/admin?done=password");
});

// ── tokens ──────────────────────────────────────────────────────────────────
admin.post("/tokens", async (c) => {
  const fd = await c.req.formData();
  const name = String(fd.get("name") ?? "").trim() || "未命名";
  const perms = fd.getAll("permissions").map(String);
  const token = generateToken();
  const hash = await sha256hex(token);
  await createToken(c.env.DB, name, hash, perms);
  return c.html(tokenCreatedView(name, token));
});

admin.post("/tokens/:id/revoke", async (c) => {
  const id = Number(c.req.param("id"));
  if (id > 0) await revokeToken(c.env.DB, id);
  return c.redirect("/admin?done=revoked");
});
