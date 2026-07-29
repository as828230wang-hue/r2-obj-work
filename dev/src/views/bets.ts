import type { ApiToken, BetRecord } from "../types";
import { esc, fmtMoney, fmtTime, page } from "./layout";

const RESULTS = ["pending", "win", "loss", "void", "half_win", "half_loss"];

interface BetsData {
  bets: BetRecord[];
  tokens: ApiToken[];
  filters: { bookmaker: string; result: string; token_id: string };
  nextCursor?: number | null;
}

export function betsView(data: BetsData): string {
  const { bets, tokens, filters, nextCursor } = data;
  const nextLink = nextCursor
    ? `/admin/bets?${new URLSearchParams({
        ...(filters.bookmaker ? { bookmaker: filters.bookmaker } : {}),
        ...(filters.result ? { result: filters.result } : {}),
        ...(filters.token_id ? { token_id: filters.token_id } : {}),
        cursor: String(nextCursor),
      }).toString()}`
    : null;
  const nameOf = (id: number) => tokens.find((t) => t.id === id)?.name ?? `t${id}`;
  const tokenOptions = tokens
    .map((t) => `<option value="${t.id}" ${String(t.id) === filters.token_id ? "selected" : ""}>${esc(t.name)} (id:${t.id})</option>`)
    .join("");

  const rows = bets.length
    ? bets
        .map((b) => {
          const profitColor = (b.profit ?? 0) >= 0 ? "#15803d" : "#b91c1c";
          const settle = b.result === "pending"
            ? `<form method="post" action="/admin/bets/${b.id}/settle" style="display:flex;gap:4px">
                 <select name="result" style="padding:4px">${RESULTS.filter((r) => r !== "pending").map((r) => `<option value="${r}">${r}</option>`).join("")}</select>
                 <input name="payout" type="number" step="0.01" placeholder="返还" style="width:80px;padding:4px">
                 <button type="submit">结算</button>
               </form>`
            : `<span class="muted">已结算</span>`;
          return `<tr>
            <td class="mono">${b.id}</td>
            <td>${esc(nameOf(b.token_id))}</td>
            <td>${esc(b.bookmaker || "—")}</td>
            <td>${esc(b.market || "—")}<span class="muted">/${esc(b.bet_side || "")}</span>${b.line != null ? ` @${b.line}` : ""}</td>
            <td>${b.odds != null ? b.odds.toFixed(2) : "—"}</td>
            <td>¥${fmtMoney(b.stake)}</td>
            <td>${esc(b.result)}</td>
            <td style="color:${profitColor}">${fmtMoney(b.profit)}</td>
            <td class="muted">${fmtTime(b.placed_at)}</td>
            <td style="white-space:nowrap">
              ${settle}
              <form method="post" action="/admin/bets/${b.id}/delete" style="display:inline"><button class="danger" type="submit" onclick="return confirm('删除投注 #${b.id}?')">删</button></form>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="10" class="muted" style="text-align:center;padding:24px">没有匹配的投注</td></tr>`;

  return page("投注记录", `
    <header>
      <h1>投注记录 (${bets.length})</h1>
      <nav class="muted"><a href="/admin">控制台</a> · <b>投注</b> · <a href="/admin/matches">赛事</a> · <a href="/admin/accounts">账号</a></nav>
    </header>
    <div class="card">
      <form method="get" action="/admin/bets" class="form" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end">
        <label>庄家<input name="bookmaker" value="${esc(filters.bookmaker)}" placeholder="hkjc/ps3838/hupu"></label>
        <label>结果
          <select name="result" style="padding:8px">
            <option value="">全部</option>
            ${RESULTS.map((r) => `<option value="${r}" ${r === filters.result ? "selected" : ""}>${r}</option>`).join("")}
          </select>
        </label>
        <label>归属令牌
          <select name="token_id" style="padding:8px">
            <option value="">全部</option>
            ${tokenOptions}
          </select>
        </label>
        <button type="submit">筛选</button>
      </form>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>ID</th><th>归属</th><th>庄家</th><th>市场/方向</th><th>赔率</th><th>金额</th><th>结果</th><th>盈亏</th><th>时间</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
        ${nextLink ? `<div style="margin-top:12px"><a class="btn" href="${nextLink}">下一页 →</a></div>` : ""}
    </div>
  `);
}
