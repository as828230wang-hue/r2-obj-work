import type { ApiToken, BetRecord } from "../types";
import type { PnlSummary } from "../lib/domain";
import { esc, fmtMoney, fmtTime, page } from "./layout";

const ALL_PERMS = ["matches:read", "matches:write", "bets:read", "bets:write", "data:read", "data:write"];

interface ByRow {
  key: string;
  bets: number;
  stake: number;
  profit: number;
}

interface DashboardData {
  admin: { username: string };
  summary: PnlSummary;
  byBookmaker: ByRow[];
  recent: BetRecord[];
  tokens: ApiToken[];
  flash?: { type: "ok" | "error"; msg: string };
}

function nav(active: string): string {
  const items: [string, string][] = [
    ["控制台", "/admin"],
    ["投注", "/admin/bets"],
    ["赛事", "/admin/matches"],
    ["账号", "/admin/accounts"],
    ["数据", "/admin/data"],
    ["文档", "/admin/docs"],
  ];
  return items
    .map(([label, href]) => (active === href ? `<b>${esc(label)}</b>` : `<a href="${href}">${esc(label)}</a>`))
    .join(" · ");
}

export function dashboardView(data: DashboardData): string {
  const { admin, summary, byBookmaker, recent, tokens, flash } = data;
  const profitColor = (summary.total_profit ?? 0) >= 0 ? "#15803d" : "#b91c1c";
  const bookRows = byBookmaker.length
    ? byBookmaker
        .map(
          (r) => `<tr><td>${esc(r.key || "—")}</td><td>${r.bets}</td><td>${fmtMoney(r.stake)}</td>
          <td style="color:${r.profit >= 0 ? "#15803d" : "#b91c1c"}">${fmtMoney(r.profit)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="muted" style="text-align:center;padding:18px">暂无已结算数据</td></tr>`;

  const recentRows = recent.length
    ? recent
        .map(
          (b) => `<tr><td class="mono">${b.id}</td><td class="muted">t${b.token_id}</td>
          <td>${esc(b.bookmaker || "—")}</td><td>${esc(b.market || "—")}/${esc(b.bet_side || "")}</td>
          <td>${fmtMoney(b.stake)}</td><td>${esc(b.result)}</td>
          <td style="color:${(b.profit ?? 0) >= 0 ? "#15803d" : "#b91c1c"}">${fmtMoney(b.profit)}</td>
          <td class="muted">${fmtTime(b.placed_at)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="8" class="muted" style="text-align:center;padding:18px">暂无投注</td></tr>`;

  const tokenRows = tokens.length
    ? tokens
        .map((t) => {
          let perms: string[] = [];
          try { perms = JSON.parse(t.permissions); } catch { perms = []; }
          const tags = perms.map((p) => `<span class="tag">${esc(p)}</span>`).join(" ");
          const status = t.active ? `<span class="tag on">启用</span>` : `<span class="tag off">已停用</span>`;
          return `<tr><td><b>${esc(t.name)}</b> ${status} <span class="muted mono">id:${t.id}</span></td>
          <td>${tags || `<span class="muted">—</span>`}</td><td class="muted">${fmtTime(t.last_used_at)}</td>
          <td>${t.active ? `<form method="post" action="/admin/tokens/${t.id}/revoke" style="display:inline"><button class="subtle" type="submit">停用</button></form>` : ""}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="4" class="muted" style="text-align:center;padding:18px">还没有令牌</td></tr>`;

  return page("控制台", `
    <header>
      <h1>足球投注台账 · 管理控制台</h1>
      <nav class="muted">${nav("/admin")} ｜ <b>${esc(admin.username)}</b> · <a href="/admin/logout">退出</a></nav>
    </header>
    ${flash ? `<div class="${flash.type === "ok" ? "ok" : "error"}">${esc(flash.msg)}</div>` : ""}

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
      <div class="card"><div class="muted">总投注</div><div style="font-size:22px">${summary.total_bets}</div></div>
      <div class="card"><div class="muted">已结算 / 待结算</div><div style="font-size:22px">${summary.settled_bets} <span class="muted">/ ${summary.pending_bets}</span></div></div>
      <div class="card"><div class="muted">总下注额</div><div style="font-size:22px">¥${fmtMoney(summary.total_stake)}</div></div>
      <div class="card"><div class="muted">已结算盈亏</div><div style="font-size:22px;color:${profitColor}">¥${fmtMoney(summary.total_profit)}</div></div>
    </div>

    <div class="card">
      <h2>按庄家盈亏</h2>
      <table>
        <thead><tr><th>庄家</th><th>注数</th><th>下注额</th><th>盈亏</th></tr></thead>
        <tbody>${bookRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>最近投注 <a class="btn subtle" href="/admin/bets" style="float:right">查看全部 →</a></h2>
      <table>
        <thead><tr><th>ID</th><th>归属</th><th>庄家</th><th>市场/方向</th><th>金额</th><th>结果</th><th>盈亏</th><th>时间</th></tr></thead>
        <tbody>${recentRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>新建 API 令牌（开发者用）</h2>
      <form method="post" action="/admin/tokens" class="form">
        <div class="row">
          <label>名称<input name="name" placeholder="例如: 对冲服务A" required></label>
          <button type="submit">生成令牌</button>
        </div>
        <fieldset style="border:1px solid #c8ccd1;border-radius:6px;margin-top:12px;padding:10px 12px">
          <legend class="muted">权限</legend>
          ${ALL_PERMS.map((p) => `<label style="display:inline-block;margin-right:18px;font-weight:400"><input type="checkbox" name="permissions" value="${p}" checked> ${esc(p)}</label>`).join("")}
        </fieldset>
      </form>
      <table style="margin-top:14px">
        <thead><tr><th>名称 / 状态</th><th>权限</th><th>最近使用</th><th>操作</th></tr></thead>
        <tbody>${tokenRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>修改密码</h2>
      <form method="post" action="/admin/password" class="form">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end">
          <label>当前密码<input type="password" name="current" required></label>
          <label>新密码(≥8位)<input type="password" name="new" required minlength="8"></label>
          <label>确认新密码<input type="password" name="confirm" required></label>
          <button type="submit">修改</button>
        </div>
      </form>
    </div>
  `);
}
