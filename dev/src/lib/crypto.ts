// Web-Crypto based helpers — all run natively in the Workers runtime.
const enc = new TextEncoder();
const dec = new TextDecoder();

export const encoder = enc;
export const decoder = dec;

export function b64encode(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64decode(str: string): Uint8Array {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (const [i, av] of a.entries()) {
    const bv = b[i];
    if (bv === undefined) return false;
    diff |= av ^ bv;
  }
  return diff === 0;
}

// ── Password hashing (PBKDF2-SHA256) ──────────────────────────────────────
const PBKDF2_ITERS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, PBKDF2_ITERS);
  return `pbkdf2$${PBKDF2_ITERS}$${b64encode(salt)}$${b64encode(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const itersStr = parts[1];
  const saltB64 = parts[2];
  const hashB64 = parts[3];
  if (itersStr === undefined || saltB64 === undefined || hashB64 === undefined) return false;
  const iters = parseInt(itersStr, 10);
  const salt = b64decode(saltB64);
  const expected = b64decode(hashB64);
  const actual = await deriveBits(password, salt, iters);
  return timingSafeEqual(expected, actual);
}

async function deriveBits(password: string, salt: Uint8Array, iters: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" },
    key,
    256,
  );
  return new Uint8Array(bits);
}

// ── HMAC-SHA256 signing (session cookies) ─────────────────────────────────
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function sign(message: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64encode(sig);
}

export async function verifySig(message: string, sigB64: string, secret: string): Promise<boolean> {
  try {
    const key = await hmacKey(secret);
    return crypto.subtle.verify("HMAC", key, b64decode(sigB64), enc.encode(message));
  } catch {
    return false;
  }
}

// ── Token utilities ───────────────────────────────────────────────────────
export async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return toHex(new Uint8Array(digest));
}

// API token format: fixed prefix + 32 random bytes. The prefix/length is a
// stable contract shared by issuance (here) and recognition elsewhere.
export function generateToken(): string {
  return "r2o_" + toHex(crypto.getRandomValues(new Uint8Array(32)));
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
