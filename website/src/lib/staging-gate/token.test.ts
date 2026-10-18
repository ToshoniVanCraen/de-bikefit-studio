import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  GATE_COOKIE_NAME,
  constantTimeEqual,
  formatGateCookie,
  gateTokenTag,
  generateGateToken,
  parseGateCookie,
  verifyGateCookie,
} from './token';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const B64URL_43 = /^[A-Za-z0-9_-]{43}$/;

async function freshCookie(secret = SECRET) {
  const token = generateGateToken();
  const tag = await gateTokenTag(secret, token);
  return { token, tag, cookie: formatGateCookie(token, tag) };
}

describe('generateGateToken', () => {
  it('is 32 random bytes as 43 base64url characters, different every time', () => {
    const a = generateGateToken();
    const b = generateGateToken();
    expect(a).toMatch(B64URL_43);
    expect(b).toMatch(B64URL_43);
    expect(a).not.toBe(b);
  });
});

describe('gateTokenTag', () => {
  it('is base64url(HMAC-SHA256(secret, "staging-gate-session:" + token))', async () => {
    const token = generateGateToken();
    const expected = createHmac('sha256', SECRET)
      .update(`staging-gate-session:${token}`)
      .digest('base64url');
    await expect(gateTokenTag(SECRET, token)).resolves.toBe(expected);
  });

  it('depends on the secret', async () => {
    const token = generateGateToken();
    const a = await gateTokenTag(SECRET, token);
    const b = await gateTokenTag(`${SECRET}y`, token);
    expect(a).toMatch(B64URL_43);
    expect(a).not.toBe(b);
  });
});

describe('cookie format', () => {
  it('uses the __Host- prefixed name', () => {
    expect(GATE_COOKIE_NAME).toBe('__Host-staging-gate');
  });

  it('round-trips v1.<token>.<tag>', async () => {
    const { token, tag, cookie } = await freshCookie();
    expect(cookie).toBe(`v1.${token}.${tag}`);
    expect(parseGateCookie(cookie)).toEqual({ token, tag });
  });

  it.each([
    null,
    undefined,
    '',
    'v1',
    `v2.${'a'.repeat(43)}.${'b'.repeat(43)}`,
    `v1.${'a'.repeat(42)}.${'b'.repeat(44)}`,
    `v1.${'a'.repeat(43)}.${'b'.repeat(43)}.`,
    `v1.${'a'.repeat(43)}+${'b'.repeat(43)}`,
    `v1.${'a'.repeat(42)}=.${'b'.repeat(43)}`,
    `v1.${'a'.repeat(42)}/.${'b'.repeat(43)}`,
    `v1.${'a'.repeat(43)}.${'b'.repeat(43)}x`,
  ])('rejects malformed %j', (value) => {
    expect(parseGateCookie(value)).toBeNull();
  });
});

describe('verifyGateCookie', () => {
  it('returns the recomputed tag for a genuine cookie', async () => {
    const { tag, cookie } = await freshCookie();
    await expect(verifyGateCookie(SECRET, cookie)).resolves.toBe(tag);
  });

  it('rejects a forged tag of the right shape', async () => {
    const { token, tag } = await freshCookie();
    const forged = tag.startsWith('A') ? `B${tag.slice(1)}` : `A${tag.slice(1)}`;
    await expect(verifyGateCookie(SECRET, formatGateCookie(token, forged))).resolves.toBeNull();
  });

  it('rejects a cookie signed with another secret', async () => {
    const { cookie } = await freshCookie(`${SECRET}-other`);
    await expect(verifyGateCookie(SECRET, cookie)).resolves.toBeNull();
  });

  it('rejects a swapped token with the original tag', async () => {
    const { tag } = await freshCookie();
    const other = generateGateToken();
    await expect(verifyGateCookie(SECRET, formatGateCookie(other, tag))).resolves.toBeNull();
  });

  it('rejects garbage without throwing', async () => {
    await expect(verifyGateCookie(SECRET, 'garbage')).resolves.toBeNull();
    await expect(verifyGateCookie(SECRET, undefined)).resolves.toBeNull();
  });
});

describe('constantTimeEqual', () => {
  it('compares equal and unequal strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('é', 'é')).toBe(false);
  });
});
