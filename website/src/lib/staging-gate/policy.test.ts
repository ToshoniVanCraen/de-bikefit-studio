import { describe, expect, it } from 'vitest';
import {
  GATE_ABSOLUTE_LIFETIME_MS,
  GATE_IDLE_TIMEOUT_MS,
  GATE_LOGIN_PATH,
  GATE_LOGIN_POST_PATH,
  GATE_RETURN_MAX_LENGTH,
  evaluateGateSession,
  isGatePublicPath,
  safeReturnPath,
  type GateSessionRow,
} from './policy';

describe('isGatePublicPath', () => {
  it.each([
    ['GET', GATE_LOGIN_PATH],
    ['HEAD', GATE_LOGIN_PATH],
    ['POST', GATE_LOGIN_POST_PATH],
    ['GET', '/favicon.ico'],
    ['GET', '/icon.svg'],
    ['GET', '/apple-icon.png'],
    ['GET', '/brand/logo.svg'],
    ['POST', '/api/webhooks/stripe'],
    ['POST', '/api/webhooks/clerk'],
  ])('%s %s is public', (method, path) => {
    expect(isGatePublicPath(path, method)).toBe(true);
  });

  it.each([
    '/',
    '/staging-toegang/afmelden',
    '/staging-toegang/',
    '/staging-toegangx',
    '/brand',
    '/api/webhooks',
    '/api/webhooks/unsigned-future-route',
    '/api/staging-gate/health',
    '/_next/image',
    '/admin',
    '/robots.txt',
    '/favicon.ico/x',
  ])('%s is gated', (path) => {
    expect(isGatePublicPath(path, 'GET')).toBe(false);
  });

  it.each([
    ['POST', GATE_LOGIN_PATH],
    ['PUT', GATE_LOGIN_PATH],
    ['GET', GATE_LOGIN_POST_PATH],
    ['POST', '/favicon.ico'],
    ['GET', '/api/webhooks/stripe'],
  ])('%s %s cannot bypass the gate', (method, path) => {
    expect(isGatePublicPath(path, method)).toBe(false);
  });
});

describe('evaluateGateSession', () => {
  const created = new Date('2026-10-18T08:00:00Z');
  const at = (ms: number) => new Date(created.getTime() + ms);
  const row = (patch: Partial<GateSessionRow> = {}): GateSessionRow => ({
    createdAt: created,
    lastUsedAt: created,
    revokedAt: null,
    accountRevokedAt: null,
    ...patch,
  });

  it('is valid at sign-in without a touch', () => {
    expect(evaluateGateSession(row(), at(0))).toEqual({ valid: true, touch: false });
  });

  it('records activity immediately so idle expiry is measured from the last request', () => {
    expect(evaluateGateSession(row(), at(1))).toEqual({
      valid: true,
      touch: true,
    });
  });

  it('ends a revoked session, and revocation wins over everything', () => {
    const revoked = row({ revokedAt: at(1), accountRevokedAt: at(1) });
    expect(evaluateGateSession(revoked, at(2))).toEqual({ valid: false, reason: 'revoked' });
    expect(evaluateGateSession(row({ accountRevokedAt: at(1) }), at(2))).toEqual({
      valid: false,
      reason: 'account_revoked',
    });
  });

  it('ends a session 8 h after sign-in, even when used a moment ago', () => {
    const busy = row({ lastUsedAt: at(GATE_ABSOLUTE_LIFETIME_MS - 1000) });
    expect(evaluateGateSession(busy, at(GATE_ABSOLUTE_LIFETIME_MS - 1)).valid).toBe(true);
    expect(evaluateGateSession(busy, at(GATE_ABSOLUTE_LIFETIME_MS))).toEqual({
      valid: false,
      reason: 'absolute',
    });
  });

  it('ends a session after 30 min without a request', () => {
    expect(evaluateGateSession(row(), at(GATE_IDLE_TIMEOUT_MS - 1)).valid).toBe(true);
    expect(evaluateGateSession(row(), at(GATE_IDLE_TIMEOUT_MS))).toEqual({
      valid: false,
      reason: 'idle',
    });
  });

  it('treats a clock that went backwards as just now', () => {
    expect(evaluateGateSession(row(), at(-60_000))).toEqual({ valid: true, touch: false });
  });
});

describe('safeReturnPath', () => {
  it.each([
    ['/', '/'],
    ['/admin', '/admin'],
    ['/aanbod?x=1&y=2', '/aanbod?x=1&y=2'],
    ['/a/b#frag', '/a/b'],
    ['/a/../b', '/b'],
    ['/api/google/callback?code=abc&state=def', '/api/google/callback?code=abc&state=def'],
    ['/staging-toegangen', '/staging-toegangen'],
  ])('keeps %j as %j', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it.each([
    ['protocol-relative', '//evil.example'],
    ['triple slash', '///evil.example'],
    ['backslash', '/\\evil.example'],
    ['leading backslashes', '\\\\evil.example'],
    ['absolute URL', 'https://evil.example/'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['relative', 'admin'],
    ['empty', ''],
    ['tab', '/\t/evil.example'],
    ['newline', '/a\nb'],
    ['NUL', '/a\u0000b'],
    ['DEL', '/a\u007fb'],
    ['login loop', GATE_LOGIN_PATH],
    ['login loop with query', `${GATE_LOGIN_PATH}?next=/`],
    ['logout loop', `${GATE_LOGIN_PATH}/afmelden`],
    ['encoded login loop', '/%73taging-toegang'],
    ['encoded logout loop', '/staging-toegang%2Fafmelden'],
    ['encoded protocol-relative path', '/%2F%2Fevil.example'],
    ['encoded backslash', '/%5Cevil.example'],
    ['malformed escape', '/%ZZ'],
    ['dot-segment into login', `/x/..${GATE_LOGIN_PATH}`],
    ['too long', `/${'a'.repeat(GATE_RETURN_MAX_LENGTH)}`],
  ])('refuses %s', (_name, input) => {
    expect(safeReturnPath(input)).toBe('/');
  });

  it('refuses non-strings and honours the fallback', () => {
    expect(safeReturnPath(undefined)).toBe('/');
    expect(safeReturnPath(null)).toBe('/');
    expect(safeReturnPath(['/admin'])).toBe('/');
    expect(safeReturnPath('//evil', '/home')).toBe('/home');
  });

  it('accepts exactly the maximum length', () => {
    const path = `/${'a'.repeat(GATE_RETURN_MAX_LENGTH - 1)}`;
    expect(safeReturnPath(path)).toBe(path);
  });
});
