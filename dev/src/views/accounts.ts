import type { ApiToken, BookmakerAccount } from "../types";
import { esc, fmtMoney, page } from "./layout";

interface AccountsData {
  accounts: BookmakerAccount[];
  tokens: ApiToken[];
}

export function accountsView(data: AccountsData): string {
  const { accounts, tokens } = data;
  const nameOf = (id: number) => tokens.find((t) => t.id === id)?.name ?? `t${id}`;

  const rows = accounts.length
    ? accounts
        .map((a) => `<tr>
          <td class="mono">${a.id}</td>
          <td>${esc(nameOf(a.token_id))}</td>
          <td>${esc(a.bookmaker)}</td>
          <td>${esc(a.label || "—")}</td>
          <td>${esc(a.currency)}</td>
          <td>¥${fmtMoney(a.balance)}</td>
          <td><form method="post" action="/admin/accounts/${a.id}/delete" style="display:inline"><button class="danger" type="submit" onclick="return confirm('删除账号 #${a.id}?')">删</button></form></td>
        </tr>`)
        .join("")
    : `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">暂无账号（由开发者通过 API 创建）</td></tr>`;

  return page("账号", `
    <header>
      <h1>庄家账号 (${accounts.length})</h1>
      <nav class="muted"><a href="/admin">控制台</a> · <a href="/admin/bets">投注</a> · <a href="/admin/matches">赛事</a> · <b>账号</b></nav>
    </header>
    <div class="card">
      <p class="muted" style="margin:0 0 12px">账号由各开发者通过 <code class="mono">POST /api/accounts</code> 自行创建；这里只读查看与删除。</p>
      <table>
        <thead><tr><th>ID</th><th>归属</th><th>庄家</th><th>标签</th><th>币种</th><th>余额</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `);
}
