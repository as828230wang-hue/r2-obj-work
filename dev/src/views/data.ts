import type { ApiToken, CustomData } from "../types";
import { esc, fmtTime, humanSize, page } from "./layout";

interface DataData {
  rows: CustomData[];
  tokens: ApiToken[];
}

export function dataView(data: DataData): string {
  const { rows, tokens } = data;
  const nameOf = (id: number) => tokens.find((t) => t.id === id)?.name ?? `t${id}`;

  const body = rows.length
    ? rows
        .map((r) => `<tr>
          <td class="mono">${esc(r.key)}</td>
          <td>${r.kind === "json" ? `<span class="tag on">json</span>` : `<span class="tag">blob</span>`}</td>
          <td class="muted">${esc(r.content_type || "—")}</td>
          <td>${r.kind === "blob" ? humanSize(r.size ?? 0) : `${r.size ?? 0} B`}</td>
          <td>${esc(nameOf(r.token_id))}</td>
          <td class="muted">${fmtTime(r.updated_at)}</td>
          <td><form method="post" action="/admin/data/${r.id}/delete" style="display:inline"><button class="danger" type="submit" onclick="return confirm('删除 ${esc(r.key)}?')">删</button></form></td>
        </tr>`)
        .join("")
    : `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">暂无自定义数据（开发者通过 PUT /api/data?key= 提交）</td></tr>`;

  return page("自定义数据", `
    <header>
      <h1>自定义数据 (${rows.length})</h1>
      <nav class="muted"><a href="/admin">控制台</a> · <a href="/admin/bets">投注</a> · <a href="/admin/matches">赛事</a> · <a href="/admin/accounts">账号</a> · <b>数据</b></nav>
    </header>
    <div class="card">
      <p class="muted" style="margin:0 0 12px">通用 <code class="mono">/api/data</code> 接口：JSON 落 D1，二进制落 R2，按 <code class="mono">key</code> 幂等。</p>
      <table>
        <thead><tr><th>Key</th><th>类型</th><th>Content-Type</th><th>大小</th><th>归属</th><th>更新时间</th><th>操作</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `);
}
