import type { ApiToken } from "../types";
import { esc, fmtTime, humanSize, page } from "./layout";

export interface ListedObject {
  key: string;
  size: number;
  uploaded: Date;
  contentType?: string;
}

interface Flash {
  type: "ok" | "error";
  msg: string;
}

interface DashboardData {
  admin: { username: string };
  objects: ListedObject[];
  truncated: boolean;
  nextCursor: string | null;
  prefix: string;
  flash?: Flash;
  tokens: ApiToken[];
}

const ALL_PERMS = ["objects:read", "objects:write"];

// Build a query string that always preserves the active prefix.
function withPrefix(prefix: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (prefix) params.set("prefix", prefix);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function dashboardView(data: DashboardData): string {
  const { admin, objects, truncated, nextCursor, prefix, flash, tokens } = data;

  const objectRows = objects.length
    ? objects
        .map((o) => {
          const k = encodeURIComponent(o.key);
          return `
      <tr>
        <td class="mono">${esc(o.key)}</td>
        <td class="muted">${esc(o.contentType || "—")}</td>
        <td>${humanSize(o.size)}</td>
        <td class="muted">${o.uploaded.toISOString().replace("T", " ").slice(0, 19)} UTC</td>
        <td style="white-space:nowrap">
          <a class="btn" href="/admin/objects/preview?key=${k}">预览</a>
          <a class="btn" href="/admin/objects/download?key=${k}">下载</a>
          <form method="post" action="/admin/objects/delete" style="display:inline">
            <input type="hidden" name="key" value="${esc(o.key)}">
            <button class="danger" type="submit" onclick="return confirm('删除 ${esc(o.key)} ?')">删除</button>
          </form>
        </td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">没有匹配的对象。</td></tr>`;

  const tokenRows = tokens.length
    ? tokens
        .map((t) => {
          let perms: string[] = [];
          try {
            perms = JSON.parse(t.permissions);
          } catch {
            perms = [];
          }
          const permTags = perms.map((p) => `<span class="tag">${esc(p)}</span>`).join(" ");
          const status = t.active
            ? `<span class="tag on">启用</span>`
            : `<span class="tag off">已停用</span>`;
          return `
      <tr>
        <td><b>${esc(t.name)}</b> ${status}</td>
        <td>${permTags || `<span class="muted">—</span>`}</td>
        <td class="muted">${fmtTime(t.created_at)}</td>
        <td class="muted">${fmtTime(t.last_used_at)}</td>
        <td>
          ${t.active ? `<form method="post" action="/admin/tokens/${t.id}/revoke" style="display:inline"><button class="subtle" type="submit">停用</button></form>` : ""}
        </td>
      </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">还没有 API 令牌。</td></tr>`;

  const pagination = nextCursor
    ? `<div style="margin-top:12px"><a class="btn" href="/admin${withPrefix(prefix, { cursor: nextCursor })}">下一页 →</a></div>`
    : "";
  const resetLink = prefix || nextCursor ? `<a class="btn subtle" href="/admin" style="margin-left:8px">重置</a>` : "";

  return page("控制台", `
    <header>
      <h1>R2 对象存储 · 管理控制台</h1>
      <nav>
        <span class="muted">已登录: <b>${esc(admin.username)}</b></span>
        <a class="btn subtle" href="/admin">刷新</a>
        <a class="btn danger" href="/admin/logout">退出</a>
      </nav>
    </header>

    ${flash ? `<div class="${flash.type === "ok" ? "ok" : "error"}">${esc(flash.msg)}</div>` : ""}

    <div class="card">
      <h2>上传对象到 R2</h2>
      <form method="post" action="/admin/objects" enctype="multipart/form-data" class="form">
        <div class="row">
          <label>文件<input type="file" name="file" required></label>
          <button type="submit">上传</button>
        </div>
        <label class="muted" style="font-weight:400;margin-top:10px">自定义 key (可选，留空用文件名)<input name="key" placeholder="例如: data/2026/report.json"></label>
      </form>
    </div>

    <div class="card">
      <h2>对象列表 ${truncated ? `<span class="muted">(本页 ${objects.length} 条，还有更多)</span>` : `(${objects.length})`}</h2>
      <form method="get" action="/admin" class="form" style="margin-bottom:14px">
        <div class="row">
          <label>按 key 前缀筛选<input name="prefix" value="${esc(prefix)}" placeholder="例如: data/2026/"></label>
          <button type="submit">搜索</button>
        </div>
      </form>
      <table>
        <thead><tr><th>Key</th><th>类型</th><th>大小</th><th>上传时间</th><th>操作</th></tr></thead>
        <tbody>${objectRows}</tbody>
      </table>
      ${pagination}
    </div>

    <div class="card">
      <h2>新建 API 令牌</h2>
      <form method="post" action="/admin/tokens" class="form">
        <div class="row">
          <label>名称<input name="name" placeholder="例如: 数据同步客户端" required></label>
          <button type="submit">生成令牌</button>
        </div>
        <fieldset style="border:1px solid #c8ccd1;border-radius:6px;margin-top:12px;padding:10px 12px">
          <legend class="muted">权限</legend>
          ${ALL_PERMS.map(
            (p) =>
              `<label style="display:inline-block;margin-right:18px;font-weight:400"><input type="checkbox" name="permissions" value="${p}" checked> ${esc(p)}</label>`,
          ).join("")}
          <span class="muted">（取消勾选则生成只读/不可用令牌）</span>
        </fieldset>
      </form>
    </div>

    <div class="card">
      <h2>API 令牌 (${tokens.length})</h2>
      <table>
        <thead><tr><th>名称 / 状态</th><th>权限</th><th>创建时间</th><th>最近使用</th><th>操作</th></tr></thead>
        <tbody>${tokenRows}</tbody>
      </table>
    </div>

    <div class="card">
      <h2>修改密码</h2>
      <form method="post" action="/admin/password" class="form">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:10px;align-items:end">
          <label>当前密码<input type="password" name="current" required></label>
          <label>新密码 (≥8位)<input type="password" name="new" required minlength="8"></label>
          <label>确认新密码<input type="password" name="confirm" required></label>
          <button type="submit">修改</button>
        </div>
      </form>
      ${resetLink ? `<p class="muted" style="margin:8px 0 0">当前筛选: <span class="mono">${esc(prefix || "(分页中)")}</span> ${resetLink}</p>` : ""}
    </div>
  `);
}
