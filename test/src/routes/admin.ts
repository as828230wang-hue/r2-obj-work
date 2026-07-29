import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireAdmin } from "../middleware/auth";
import {
  createToken,
  getAdminById,
  getAdminByUsername,
  listTokens,
  revokeToken,
  updateAdminPassword,
} from "../lib/db";
import { generateToken, hashPassword, sha256hex, verifyPassword } from "../lib/crypto";
import { endSession, startSession } from "../lib/session";
import { loginView } from "../views/login";
import { dashboardView, type ListedObject } from "../views/dashboard";
import { tokenCreatedView } from "../views/tokenCreated";
import { previewView } from "../views/preview";

const PAGE_SIZE = 50;
const PREVIEW_MAX = 1024 * 1024; // 1 MiB in-memory preview cap

const FLASH_OK: Record<string, string> = {
  uploaded: "对象已上传",
  deleted: "对象已删除",
  revoked: "令牌已停用",
  password: "密码已修改",
};
const FLASH_ERR: Record<string, string> = {
  pw_short: "新密码至少 8 位",
  pw_mismatch: "两次输入的新密码不一致",
  pw_wrong: "当前密码错误",
};

export const admin = new Hono<AppEnv>();

// ── Public auth routes ────────────────────────────────────────────────────
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

// Everything below requires a valid admin session.
admin.use("/*", requireAdmin);

// ── Dashboard (paginated + prefix-filtered + flash) ───────────────────────
admin.get("/", async (c) => {
  const prefix = c.req.query("prefix") ?? "";
  const cursor = c.req.query("cursor") ?? undefined;
  const listed = await c.env.BUCKET.list({ prefix, limit: PAGE_SIZE, cursor });
  const objects: ListedObject[] = listed.objects.map((o) => ({
    key: o.key,
    size: o.size,
    uploaded: o.uploaded,
    contentType: o.httpMetadata?.contentType,
  }));
  const tokens = await listTokens(c.env.DB);

  const done = c.req.query("done") ?? "";
  const flash = FLASH_OK[done]
    ? { type: "ok" as const, msg: FLASH_OK[done] }
    : FLASH_ERR[done]
      ? { type: "error" as const, msg: FLASH_ERR[done] }
      : undefined;

  return c.html(
    dashboardView({
      admin: c.get("admin"),
      objects,
      truncated: listed.truncated,
      nextCursor: listed.truncated ? listed.cursor : null,
      prefix,
      flash,
      tokens,
    }),
  );
});

// ── Object CRUD ───────────────────────────────────────────────────────────
admin.post("/objects", async (c) => {
  const fd = await c.req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return c.redirect("/admin?done=uploaded");
  const customKey = String(fd.get("key") ?? "").trim();
  const key = customKey || file.name;
  const contentType = file.type || "application/octet-stream";
  await c.env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { uploadedBy: c.get("admin").username },
  });
  return c.redirect("/admin?done=uploaded");
});

admin.get("/objects/preview", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.text("missing key", 400);
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.text("not found", 404);
  const tooLarge = obj.size > PREVIEW_MAX;
  return c.html(
    previewView({
      key,
      contentType: obj.httpMetadata?.contentType ?? "application/octet-stream",
      size: obj.size,
      uploaded: obj.uploaded,
      body: tooLarge ? null : await obj.arrayBuffer(),
    }),
  );
});

admin.get("/objects/download", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.text("missing key", 400);
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.text("not found", 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  const filename = encodeURIComponent(key.split("/").pop() || key);
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("Cache-Control", "no-store");
  return new Response(obj.body, { headers });
});

admin.post("/objects/delete", async (c) => {
  const fd = await c.req.formData();
  const key = String(fd.get("key") ?? "");
  if (key) await c.env.BUCKET.delete(key);
  return c.redirect("/admin?done=deleted");
});

// ── Account ───────────────────────────────────────────────────────────────
admin.post("/password", async (c) => {
  const fd = await c.req.formData();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("new") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (next.length < 8) return c.redirect("/admin?done=pw_short");
  if (next !== confirm) return c.redirect("/admin?done=pw_mismatch");
  const admin = c.get("admin");
  const user = await getAdminById(c.env.DB, admin.id);
  if (!user || !(await verifyPassword(current, user.password_hash))) {
    return c.redirect("/admin?done=pw_wrong");
  }
  await updateAdminPassword(c.env.DB, admin.id, await hashPassword(next));
  return c.redirect("/admin?done=password");
});

// ── Token management ──────────────────────────────────────────────────────
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
