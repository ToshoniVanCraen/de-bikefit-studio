/**
 * The staging gate's session cookie: format, random token, HMAC tag and the
 * constant-time check — on Web Crypto only (`crypto.subtle`,
 * `crypto.getRandomValues`), so one implementation serves the edge middleware,
 * the Node server action and vitest. Design: `docs/staging-gate.md` §2.
 *
 * Cookie value: `v1.<token>.<tag>`
 *  - `token`: 32 random bytes, base64url without padding (43 characters);
 *  - `tag`: base64url(HMAC-SHA256(secret, "staging-gate-session:" + token)),
 *    43 characters.
 *
 * The database stores the tag as `token_hash` and never the token. A request
 * is only looked up after its tag verified, and the lookup key is the tag the
 * server recomputed, never the bytes the client sent.
 */

export const GATE_COOKIE_NAME = '__Host-staging-gate';

const VERSION = 'v1';
const TAG_CONTEXT = 'staging-gate-session:';
const TOKEN_BYTES = 32;
/** 32 bytes → 43 base64url characters; same for a SHA-256 tag. */
const PART = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_MAX_LENGTH = VERSION.length + 1 + 43 + 1 + 43;

export type ParsedGateCookie = { token: string; tag: string };

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A fresh session token (never stored, only its tag is). */
export function generateGateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** base64url(HMAC-SHA256(secret, "staging-gate-session:" + token)). */
export async function gateTokenTag(secret: string, token: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(TAG_CONTEXT + token));
  return toBase64Url(new Uint8Array(signature));
}

export function formatGateCookie(token: string, tag: string): string {
  return `${VERSION}.${token}.${tag}`;
}

/** Strict shape check only; says nothing about authenticity. */
export function parseGateCookie(value: string | null | undefined): ParsedGateCookie | null {
  if (typeof value !== 'string' || value.length !== COOKIE_MAX_LENGTH) return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  const [, token, tag] = parts;
  if (!PART.test(token) || !PART.test(tag)) return null;
  return { token, tag };
}

/**
 * Constant-time equality of two strings of the same length. A length
 * mismatch returns false at once: the only thing that leaks is the length,
 * which for a tag is public (43).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * The recomputed tag (= the `token_hash` to look up) when the cookie is well
 * formed and its tag matches, otherwise null. No database involved.
 */
export async function verifyGateCookie(
  secret: string,
  value: string | null | undefined,
): Promise<string | null> {
  const parsed = parseGateCookie(value);
  if (!parsed) return null;
  const expected = await gateTokenTag(secret, parsed.token);
  return constantTimeEqual(expected, parsed.tag) ? expected : null;
}
