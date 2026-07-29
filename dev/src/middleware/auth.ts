import { createMiddleware } from "hono/factory";
import { ensureSchema, getTokenByHash, touchToken } from "../lib/db";
import { getSession } from "../lib/session";
import { sha256hex } from "../lib/crypto";
import type { AppEnv } from "../types";

/** Require a valid admin session cookie; else redirect to login. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  await ensureSchema(c.env.DB);
  const session = await getSession(c);
  if (!session) return c.redirect("/admin/login");
  c.set("admin", { id: session.uid, username: session.username });
  await next();
});

/**
 * Require a bearer API token carrying the given permission, and resolve its
 * owner id onto the context as `tokenId`. All domain queries scope by it, so
 * each developer only ever sees their own data.
 */
export function requireToken(perm: string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    await ensureSchema(c.env.DB);
    const header = c.req.header("Authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return c.json({ error: "missing bearer token" }, 401);
    const tokenValue = match[1];
    if (!tokenValue) return c.json({ error: "missing bearer token" }, 401);
    const hash = await sha256hex(tokenValue.trim());
    const token = await getTokenByHash(c.env.DB, hash);
    if (!token) return c.json({ error: "invalid or revoked token" }, 401);
    const perms: string[] = JSON.parse(token.permissions);
    if (!perms.includes(perm) && !perms.includes("*")) {
      return c.json({ error: `token lacks permission: ${perm}` }, 403);
    }
    c.set("tokenId", token.id);
    c.executionCtx.waitUntil(touchToken(c.env.DB, token.id));
    await next();
  });
}
