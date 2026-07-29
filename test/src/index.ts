import { Hono } from "hono";
import type { AppEnv } from "./types";
import { initStore } from "./lib/db";
import { admin } from "./routes/admin";
import { api } from "./routes/api";

const app = new Hono<AppEnv>();

// Bootstrap D1 schema + seed admin once per isolate (idempotent, cached).
app.use("*", async (c, next) => {
  await initStore(c.env);
  await next();
});

app.route("/admin", admin);
app.route("/api", api);

app.get("/", (c) => c.redirect("/admin"));
app.get("/health", (c) => c.text("ok"));

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal error" }, 500);
});

export default app;
