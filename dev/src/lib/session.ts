import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { b64decode, b64encode, decoder, encoder, sign, verifySig } from "./crypto";
import type { AppEnv } from "../types";

const COOKIE_NAME = "r2o_session";
const TTL_SECONDS = 8 * 60 * 60; // 8h

interface SessionData {
  uid: number;
  username: string;
  exp: number;
}

export async function startSession(c: Context<AppEnv>, uid: number, username: string): Promise<void> {
  const payload = { uid, username, exp: Date.now() + TTL_SECONDS * 1000 };
  const body = b64encode(encoder.encode(JSON.stringify(payload)));
  const sig = await sign(body, c.env.SESSION_SECRET);
  const secure = new URL(c.req.url).protocol === "https:";
  setCookie(c, COOKIE_NAME, `${body}.${sig}`, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure,
    maxAge: TTL_SECONDS,
  });
}

export async function getSession(c: Context<AppEnv>): Promise<SessionData | null> {
  const raw = getCookie(c, COOKIE_NAME);
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  if (!(await verifySig(body, sig, c.env.SESSION_SECRET))) return null;
  try {
    const data = JSON.parse(decoder.decode(b64decode(body))) as SessionData;
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function endSession(c: Context<AppEnv>): void {
  deleteCookie(c, COOKIE_NAME, { path: "/" });
}
