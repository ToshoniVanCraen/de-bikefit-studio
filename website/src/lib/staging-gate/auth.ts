/**
 * The staging gate's sign-in rules, pure: identifier normalisation, the
 * rate-limit scopes, form parsing, the login decision and the cookie
 * attributes. No database, no Next, no `server-only`: the server action
 * (`./actions.ts`), the repo (`./auth-repo.ts`), the account CLI
 * (`scripts/lib/staging-access.mts`) and the unit tests share it.
 * Design: `docs/staging-gate.md` §3.
 */
import { createHash } from 'node:crypto';
import type { RateLimitScope } from '@/lib/rate-limit';
import { normalizeIp } from '@/lib/request-ip';
import { PASSWORD_MAX_LENGTH } from '@/lib/cms/password';
import { GATE_FIELD_IDENTIFIER, GATE_FIELD_NEXT, GATE_FIELD_PASSWORD } from './form-state';
import { safeReturnPath } from './policy';

/** An e-mail address is at most 254 characters (RFC 5321 path limit). */
export const GATE_EMAIL_MAX_LENGTH = 254;
export const GATE_USERNAME_MIN_LENGTH = 3;
export const GATE_USERNAME_MAX_LENGTH = 64;
/**
 * Raw input longer than this is malformed without looking at it further;
 * also the bound on what feeds the identifier's rate-limit key.
 */
export const GATE_IDENTIFIER_INPUT_MAX = 320;

/** 10 attempts per 15 minutes per IP and per identifier; every attempt counts. */
export const GATE_RATE_LIMIT_MAX = 10;
export const GATE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * The hash every attempt without a usable account is verified against, so
 * unknown, malformed and over-long input cost the same scrypt run as a real
 * account (no timing shortcut). Same format and parameters as
 * `hashPassword()` (N = 2^17, r = 8, p = 1, 16-byte salt, 64-byte key) of a
 * random password that was discarded: nobody knows it, and a match would not
 * matter, because the decision never accepts an attempt without an account.
 */
export const GATE_DUMMY_PASSWORD_HASH =
  'scrypt$131072$8$1$cRd8f8izu3fsARcpPSqdUw==$nNm9lC4vrB6Gwrbmm7FY+clkJ9HtygEWi067WGRMkYSQsXtG3hZ6eMu+pxTDXB4N570pfHFpTV0Ko2TEO4IYVQ==';

/** Printable ASCII without space; checked BEFORE lower-casing (no `K` (Kelvin) → `k` tricks). */
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;
const USERNAME = /^[a-z0-9._-]+$/;
const EMAIL_LOCAL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_LABEL = /^[a-z0-9-]+$/;
const TOP_LEVEL = /^[a-z]{2,63}$/;

/**
 * An e-mail address as the gate accepts it: one `@`, a local part of at most
 * 64 characters without leading, trailing or doubled dots, and a domain of at
 * least two labels (1–63 characters, no leading or trailing hyphen) ending in
 * an alphabetic top-level label. Split by hand and checked with single
 * character classes only, so no pattern can backtrack (the caller bounded the
 * length already).
 */
function isGateEmail(value: string): boolean {
  if (value.length > GATE_EMAIL_MAX_LENGTH) return false;
  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (local.length > 64 || !EMAIL_LOCAL.test(local)) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  if (domain.length === 0 || domain.length > 253) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (label.length === 0 || label.length > 63 || !DOMAIN_LABEL.test(label)) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }
  return TOP_LEVEL.test(labels[labels.length - 1]);
}

/**
 * The stored form of an identifier: trimmed, lower-cased, and either a valid
 * e-mail address or a 3–64 character username of `a-z 0-9 . _ -`. Null for
 * anything else: too long (checked before any pattern), control characters,
 * spaces, non-ASCII. The CLI stores exactly this; the login looks up exactly
 * this.
 */
export function normalizeGateIdentifier(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > GATE_IDENTIFIER_INPUT_MAX) return null;
  const trimmed = raw.trim();
  if (trimmed.length < GATE_USERNAME_MIN_LENGTH || trimmed.length > GATE_EMAIL_MAX_LENGTH) {
    return null;
  }
  if (!PRINTABLE_ASCII.test(trimmed)) return null;
  const value = trimmed.toLowerCase();
  if (value.includes('@')) return isGateEmail(value) ? value : null;
  if (value.length > GATE_USERNAME_MAX_LENGTH || !USERNAME.test(value)) return null;
  return value;
}

/**
 * `gate:id:<SHA-256 hex>` of the normalised identifier. A malformed value
 * still gets a key (its trimmed, lower-cased first {@link GATE_IDENTIFIER_INPUT_MAX}
 * characters), so garbage cannot sidestep the per-identifier limit. The raw
 * identifier never reaches the database.
 */
export function gateIdentifierKey(raw: string): string {
  const material =
    normalizeGateIdentifier(raw) ?? raw.slice(0, GATE_IDENTIFIER_INPUT_MAX).trim().toLowerCase();
  return `gate:id:${createHash('sha256').update(material).digest('hex')}`;
}

/** `gate:ip:<address>` for a valid client IP, otherwise null (never one shared "unknown" key). */
export function gateIpKey(ip: string | null | undefined): string | null {
  const known = normalizeIp(ip);
  return known ? `gate:ip:${known}` : null;
}

/** The scopes one sign-in attempt counts against, in reservation order: IP (when known), identifier. */
export function gateRateLimitScopes(attempt: {
  identifierKey: string;
  ip: string | null | undefined;
}): RateLimitScope[] {
  const keys: string[] = [];
  const ipKey = gateIpKey(attempt.ip);
  if (ipKey) keys.push(ipKey);
  keys.push(attempt.identifierKey);
  return keys.map((key) => ({
    key,
    limit: GATE_RATE_LIMIT_MAX,
    windowMs: GATE_RATE_LIMIT_WINDOW_MS,
  }));
}

export type GateLoginInput = {
  /** Normalised identifier, or null when malformed (still takes the dummy scrypt path). */
  identifier: string | null;
  /** Rate-limit key of the identifier ({@link gateIdentifierKey}). */
  identifierKey: string;
  /** The password as typed, or null when longer than `PASSWORD_MAX_LENGTH` (dummy path). */
  password: string | null;
  /** Where a success goes: `safeReturnPath(next)`. */
  next: string;
};

export type ParsedGateLogin =
  { ok: false; reason: 'missing' } | { ok: true; input: GateLoginInput };

type FormSource = { get(name: string): unknown };

/** The login form's three fields. Missing identifier or password → `missing`; nothing else is refused here. */
export function parseGateLoginForm(form: FormSource): ParsedGateLogin {
  const rawIdentifier = form.get(GATE_FIELD_IDENTIFIER);
  const rawPassword = form.get(GATE_FIELD_PASSWORD);
  const identifierText = typeof rawIdentifier === 'string' ? rawIdentifier : '';
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  if (identifierText.trim() === '' || password === '') return { ok: false, reason: 'missing' };
  return {
    ok: true,
    input: {
      identifier: normalizeGateIdentifier(identifierText),
      identifierKey: gateIdentifierKey(identifierText),
      password: password.length > PASSWORD_MAX_LENGTH ? null : password,
      next: safeReturnPath(form.get(GATE_FIELD_NEXT)),
    },
  };
}

export type GateAccountRecord = { id: string; passwordHash: string; revokedAt: Date | null };

export type GateLoginDeps = {
  findAccount: (identifier: string) => Promise<GateAccountRecord | null>;
  /** `verifyPassword()` in production; may throw `PasswordHasherBusyError` (propagates). */
  verify: (password: string, storedHash: string) => Promise<boolean>;
  dummyHash?: string;
};

export type GateLoginDecision = { ok: true; accountId: string } | { ok: false };

/**
 * Exactly one scrypt run per attempt, whatever the input: against the
 * account's own hash when the identifier exists (revoked or not), otherwise
 * against the dummy hash. Unknown, malformed, revoked, over-long and wrong
 * all end in the same `{ ok: false }`.
 */
export async function decideLogin(
  input: Pick<GateLoginInput, 'identifier' | 'password'>,
  deps: GateLoginDeps,
): Promise<GateLoginDecision> {
  const account = input.identifier !== null ? await deps.findAccount(input.identifier) : null;
  const storedHash = account ? account.passwordHash : (deps.dummyHash ?? GATE_DUMMY_PASSWORD_HASH);
  const matches = await deps.verify(input.password ?? '', storedHash);
  if (!matches || !account || account.revokedAt !== null || input.password === null) {
    return { ok: false };
  }
  return { ok: true, accountId: account.id };
}

export type GateCookieOptions = {
  httpOnly: true;
  secure: true;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

/**
 * Attributes of `__Host-staging-gate`. The `__Host-` prefix requires Secure,
 * `Path=/` and no Domain, so `secure` is unconditional (the gate only runs on
 * the HTTPS staging host). `maxAge` 0 clears it.
 */
export function gateCookieOptions(maxAgeSeconds: number): GateCookieOptions {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(0, Math.floor(maxAgeSeconds)),
  };
}
