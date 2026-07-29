import { esc, page } from "./layout";

export function tokenCreatedView(name: string, token: string): string {
  return page("令牌已生成", `
    <div class="card" style="max-width:720px;margin:48px auto">
      <h2>API 令牌已生成</h2>
      <div class="ok">名称：<b>${esc(name)}</b></div>
      <p class="muted">这是令牌的完整明文，<b>仅显示这一次</b>。请立即复制保存，之后只能看到它的哈希。</p>
      <div class="box">${esc(token)}</div>
      <p style="margin-top:14px">
        调用外部 API 时使用：<br>
        <code class="mono">Authorization: Bearer ${esc(token)}</code>
      </p>
      <p style="margin-top:18px">
        <a class="btn" href="/admin">返回控制台</a>
      </p>
    </div>
  `);
}
