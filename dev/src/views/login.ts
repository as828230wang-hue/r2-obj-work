import { esc, page } from "./layout";

export function loginView(error?: string): string {
  return page("登录", `
    <div class="card" style="max-width:380px;margin:64px auto">
      <h1 style="font-size:18px;margin:0 0 6px">R2 对象存储 · 后台</h1>
      <p class="muted" style="margin:0 0 16px">登录管理控制台</p>
      <form method="post" action="/admin/login" class="form">
        ${error ? `<div class="error">${esc(error)}</div>` : ""}
        <label>用户名<input name="username" required autofocus></label>
        <label>密码<input type="password" name="password" required></label>
        <button type="submit" style="width:100%">登录</button>
      </form>
    </div>
  `);
}
