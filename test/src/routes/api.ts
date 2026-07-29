import { Hono } from "hono";
import type { AppEnv } from "../types";
import { requireToken } from "../middleware/auth";

export const api = new Hono<AppEnv>();

// GET /api/objects?prefix=&limit=&cursor= → list objects
api.get("/objects", requireToken("objects:read"), async (c) => {
  const prefix = c.req.query("prefix") ?? "";
  const limitParam = Number(c.req.query("limit"));
  const limit = limitParam > 0 ? Math.min(limitParam, 1000) : 100;
  const cursor = c.req.query("cursor") ?? undefined;
  const listed = await c.env.BUCKET.list({ prefix, limit, cursor });
  return c.json({
    objects: listed.objects.map((o) => ({
      key: o.key,
      size: o.size,
      etag: o.etag,
      uploaded: o.uploaded.toISOString(),
      contentType: o.httpMetadata?.contentType ?? null,
    })),
    cursor: listed.truncated ? listed.cursor : null,
    truncated: listed.truncated,
  });
});

// GET /api/object?key=KEY → download bytes
api.get("/object", requireToken("objects:read"), async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "missing ?key=" }, 400);
  const obj = await c.env.BUCKET.get(key);
  if (!obj) return c.json({ error: "not found" }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("ETag", obj.httpEtag);
  headers.set("Cache-Control", "no-store");
  return new Response(obj.body, { headers });
});

// POST /api/object?key=KEY  body=raw bytes → upload
api.post("/object", requireToken("objects:write"), async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "missing ?key=" }, 400);
  const contentType = c.req.header("content-type") || "application/octet-stream";
  const body = await c.req.arrayBuffer();
  await c.env.BUCKET.put(key, body, { httpMetadata: { contentType } });
  return c.json({ key, size: body.byteLength, contentType, created: true });
});

// PUT /api/object?key=KEY  body=raw bytes → overwrite
api.put("/object", requireToken("objects:write"), async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "missing ?key=" }, 400);
  const contentType = c.req.header("content-type") || "application/octet-stream";
  const body = await c.req.arrayBuffer();
  await c.env.BUCKET.put(key, body, { httpMetadata: { contentType } });
  return c.json({ key, size: body.byteLength, contentType, updated: true });
});

// DELETE /api/object?key=KEY → delete
api.delete("/object", requireToken("objects:write"), async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "missing ?key=" }, 400);
  await c.env.BUCKET.delete(key);
  return c.json({ key, deleted: true });
});
