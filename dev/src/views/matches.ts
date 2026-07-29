import type { ApiToken, Match } from "../types";
import { esc, fmtTime, page } from "./layout";

interface MatchesData {
  matches: Match[];
  tokens: ApiToken[];
  nextCursor?: number | null;
}

export function matchesView(data: MatchesData): string {
  const { matches, tokens, nextCursor } = data;
  const nameOf = (id: number) => tokens.find((t) => t.id === id)?.name ?? `t${id}`;

  const rows = matches.length
    ? matches
        .map((m) => `<tr>
          <td class="mono">${m.id}</td>
          <td>${esc(nameOf(m.token_id))}</td>
          <td>${esc(m.league || "—")}</td>
          <td>${esc(m.home_team || "—")} <span class="muted">vs</span> ${esc(m.away_team || "—")}</td>
          <td class="muted">${fmtTime(m.kickoff_at)}</td>
          <td>${m.home_score != null ? `${m.home_score} : ${m.away_score}` : "—"}</td>
          <td>${esc(m.status)}</td>
          <td class="mono muted">${esc(m.ext_id || "—")}</td>
          <td><form method="post" action="/admin/matches/${m.id}/delete" style="display:inline"><button class="danger" type="submit" onclick="return confirm('删除赛事 #${m.id}?')">删</button></form></td>
        </tr>`)
        .join("")
    : `<tr><td colspan="9" class="muted" style="text-align:center;padding:24px">暂无赛事</td></tr>`;

  return page("赛事", `
    <header>
      <h1>赛事 (${matches.length})</h1>
      <nav class="muted"><a href="/admin">控制台</a> · <a href="/admin/bets">投注</a> · <b>赛事</b> · <a href="/admin/accounts">账号</a></nav>
    </header>
    <div class="card">
      <table>
        <thead><tr><th>ID</th><th>归属</th><th>联赛</th><th>对阵</th><th>开赛</th><th>比分</th><th>状态</th><th>ext_id</th><th>操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
        ${nextCursor ? `<div style="margin-top:12px"><a class="btn" href="/admin/matches?cursor=${nextCursor}">下一页 →</a></div>` : ""}
    </div>
  `);
}
