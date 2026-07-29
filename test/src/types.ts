// Runtime bindings injected by wrangler (see wrangler.toml).
export interface AppBindings {
  /** D1 — structured data: admin users, API tokens. */
  DB: D1Database;
  /** R2 — object/blob storage. */
  BUCKET: R2Bucket;
  /** HMAC secret for signing session cookies. */
  SESSION_SECRET: string;
  /** Bootstrap admin username (from [vars]). */
  ADMIN_USERNAME?: string;
  /** Bootstrap admin password (from .dev.vars / secret). */
  ADMIN_PASSWORD?: string;
}

export interface AdminUser {
  id: number;
  username: string;
  password_hash: string;
  created_at: number;
}

export interface ApiToken {
  id: number;
  name: string;
  token_hash: string;
  permissions: string;
  active: number;
  created_at: number;
  last_used_at: number | null;
}

// Hono environment: bindings + per-request variables.
export interface AppEnv {
  Bindings: AppBindings;
  Variables: {
    admin: { id: number; username: string };
  };
}
