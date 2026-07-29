// Runtime bindings injected by wrangler (see wrangler.toml).
export interface AppBindings {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  ADMIN_USERNAME?: string;
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

// ── Betting-ledger entities (all token-isolated) ──────────────────────────
export interface Match {
  id: number;
  token_id: number;
  ext_id: string | null;
  league: string | null;
  season: string | null;
  home_team: string | null;
  away_team: string | null;
  kickoff_at: number | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
  source: string | null;
  notes: string | null;
  raw: string | null;
  created_at: number;
  updated_at: number;
}

export interface BookmakerAccount {
  id: number;
  token_id: number;
  bookmaker: string;
  label: string | null;
  currency: string;
  balance: number;
  created_at: number;
  updated_at: number;
}

export interface BetRecord {
  id: number;
  token_id: number;
  match_id: number | null;
  account_id: number | null;
  ticket_id: string | null;
  bookmaker: string | null;
  market: string | null;
  bet_side: string | null;
  line: number | null;
  odds: number | null;
  stake: number;
  currency: string;
  result: string;
  payout: number | null;
  profit: number | null;
  placed_at: number | null;
  settled_at: number | null;
  hedge_group_id: number | null;
  notes: string | null;
  raw: string | null;
  created_at: number;
  updated_at: number;
}

export interface OddsSnapshot {
  id: number;
  token_id: number;
  match_id: number;
  bookmaker: string | null;
  market: string | null;
  bet_side: string | null;
  line: number | null;
  odds: number | null;
  captured_at: number;
  created_at: number;
}

export interface HedgeGroup {
  id: number;
  token_id: number;
  name: string | null;
  strategy: string | null;
  status: string;
  expected_profit: number | null;
  total_stake: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface Attachment {
  id: number;
  token_id: number;
  bet_id: number | null;
  match_id: number | null;
  r2_key: string;
  filename: string | null;
  content_type: string | null;
  size: number | null;
  kind: string | null;
  created_at: number;
}

export interface CustomData {
  id: number;
  token_id: number;
  key: string;
  kind: string; // 'json' | 'blob'
  content_type: string | null;
  size: number | null;
  json: string | null;
  r2_key: string | null;
  created_at: number;
  updated_at: number;
}

// Hono environment: bindings + per-request variables.
export interface AppEnv {
  Bindings: AppBindings;
  Variables: {
    admin: { id: number; username: string };
    tokenId: number; // resolved bearer-token owner; all domain queries scope by it
  };
}
