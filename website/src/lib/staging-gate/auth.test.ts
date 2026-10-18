import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PASSWORD_MAX_LENGTH, PasswordHasherBusyError, needsRehash } from '@/lib/cms/password';
import {
  GATE_DUMMY_PASSWORD_HASH,
  GATE_IDENTIFIER_INPUT_MAX,
  GATE_RATE_LIMIT_MAX,
  GATE_RATE_LIMIT_WINDOW_MS,
  decideLogin,
  gateCookieOptions,
  gateIdentifierKey,
  gateIpKey,
  gateRateLimitScopes,
  normalizeGateIdentifier,
  parseGateLoginForm,
  type GateAccountRecord,
} from './auth';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function form(fields: Record<string, string | undefined>) {
  return { get: (name: string) => fields[name] ?? null };
}

describe('normalizeGateIdentifier', () => {
  it('trims and lower-cases a valid e-mail address or username', () => {
    expect(normalizeGateIdentifier('  Reviewer@Example.BE ')).toBe('reviewer@example.be');
    expect(normalizeGateIdentifier('max.review_1-a')).toBe('max.review_1-a');
    expect(normalizeGateIdentifier('Arend')).toBe('arend');
    expect(normalizeGateIdentifier('first.last+gate@sub.example.com')).toBe(
      'first.last+gate@sub.example.com',
    );
  });

  it('bounds usernames to 3–64 characters of a-z 0-9 . _ -', () => {
    expect(normalizeGateIdentifier('ab')).toBeNull();
    expect(normalizeGateIdentifier('abc')).toBe('abc');
    expect(normalizeGateIdentifier('a'.repeat(64))).toBe('a'.repeat(64));
    expect(normalizeGateIdentifier('a'.repeat(65))).toBeNull();
    expect(normalizeGateIdentifier('max review')).toBeNull();
    expect(normalizeGateIdentifier('max/review')).toBeNull();
  });

  it('refuses malformed e-mail addresses', () => {
    for (const value of [
      '@example.be',
      'a@',
      'a@b',
      'a@@example.be',
      'a@b@example.be',
      '.a@example.be',
      'a.@example.be',
      'a..b@example.be',
      'a@-example.be',
      'a@example-.be',
      'a@example..be',
      'a@example.b',
      'a@example.123',
      `${'a'.repeat(65)}@example.be`,
      `a@${'b'.repeat(64)}.be`,
    ]) {
      expect(normalizeGateIdentifier(value), value).toBeNull();
    }
    expect(normalizeGateIdentifier(`${'a'.repeat(64)}@example.be`)).not.toBeNull();
  });

  it('refuses over-long input before any pattern, control characters and non-ASCII', () => {
    expect(normalizeGateIdentifier(`${'a'.repeat(250)}@example.be`)).toBeNull();
    expect(normalizeGateIdentifier('a'.repeat(GATE_IDENTIFIER_INPUT_MAX + 1))).toBeNull();
    const started = Date.now();
    expect(normalizeGateIdentifier(`${'a.'.repeat(500_000)}@x`)).toBeNull();
    expect(Date.now() - started).toBeLessThan(100);
    expect(normalizeGateIdentifier('max\u0000review')).toBeNull();
    expect(normalizeGateIdentifier('max\treview')).toBeNull();
    expect(normalizeGateIdentifier('max\u007freview')).toBeNull();
    expect(normalizeGateIdentifier('jösé@example.be')).toBeNull();
    expect(normalizeGateIdentifier('reviewer@exämple.be')).toBeNull();
    // KELVIN SIGN lower-cases to an ASCII "k": refused before lower-casing.
    expect(normalizeGateIdentifier('Kim.review')).toBeNull();
    expect(normalizeGateIdentifier(42)).toBeNull();
    expect(normalizeGateIdentifier(null)).toBeNull();
  });
});

describe('rate-limit keys and scopes', () => {
  it('keys the identifier by the SHA-256 hex of its normalised form, never the raw value', () => {
    const key = gateIdentifierKey(' Reviewer@Example.BE ');
    expect(key).toBe(`gate:id:${sha256('reviewer@example.be')}`);
    expect(key).toMatch(/^gate:id:[0-9a-f]{64}$/);
    expect(key).not.toContain('reviewer');
    expect(gateIdentifierKey('REVIEWER@example.be')).toBe(key);
  });

  it('still keys malformed input (bounded, trimmed, lower-cased), so garbage is limited too', () => {
    expect(gateIdentifierKey(' Not Valid ')).toBe(`gate:id:${sha256('not valid')}`);
    const long = 'x'.repeat(10_000);
    expect(gateIdentifierKey(long)).toBe(
      `gate:id:${sha256('x'.repeat(GATE_IDENTIFIER_INPUT_MAX))}`,
    );
  });

  it('uses the IP only when it is a valid address', () => {
    expect(gateIpKey('203.0.113.7')).toBe('gate:ip:203.0.113.7');
    expect(gateIpKey('unknown')).toBeNull();
    expect(gateIpKey(null)).toBeNull();
  });

  it('reserves IP then identifier, 10 per 15 minutes each', () => {
    const identifierKey = gateIdentifierKey('arend');
    expect(gateRateLimitScopes({ identifierKey, ip: '2001:db8::1' })).toEqual([
      { key: 'gate:ip:2001:db8::1', limit: 10, windowMs: 15 * 60 * 1000 },
      { key: identifierKey, limit: 10, windowMs: 15 * 60 * 1000 },
    ]);
    expect(gateRateLimitScopes({ identifierKey, ip: 'garbage' })).toEqual([
      { key: identifierKey, limit: GATE_RATE_LIMIT_MAX, windowMs: GATE_RATE_LIMIT_WINDOW_MS },
    ]);
  });
});

describe('parseGateLoginForm', () => {
  it('asks for both fields when one is missing or blank', () => {
    expect(parseGateLoginForm(form({ password: 'x' }))).toEqual({ ok: false, reason: 'missing' });
    expect(parseGateLoginForm(form({ identifier: '  ', password: 'x' }))).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(parseGateLoginForm(form({ identifier: 'arend' }))).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('normalises, bounds the password and validates the return path', () => {
    const parsed = parseGateLoginForm(
      form({ identifier: ' Arend ', password: 'secret', next: '/aanbod?x=1' }),
    );
    expect(parsed).toEqual({
      ok: true,
      input: {
        identifier: 'arend',
        identifierKey: gateIdentifierKey('arend'),
        password: 'secret',
        next: '/aanbod?x=1',
      },
    });
    const long = parseGateLoginForm(
      form({ identifier: 'arend', password: 'p'.repeat(PASSWORD_MAX_LENGTH + 1), next: '//evil' }),
    );
    expect(long.ok && long.input.password).toBeNull();
    expect(long.ok && long.input.next).toBe('/');
    const malformed = parseGateLoginForm(form({ identifier: 'a b', password: 'x' }));
    expect(malformed.ok && malformed.input.identifier).toBeNull();
  });
});

describe('decideLogin', () => {
  const account: GateAccountRecord = { id: 'acc-1', passwordHash: 'scrypt$real', revokedAt: null };

  function deps(found: GateAccountRecord | null, matches: boolean) {
    return {
      findAccount: vi.fn(async () => found),
      verify: vi.fn(async () => matches),
    };
  }

  it('accepts the right password of an active account', async () => {
    const d = deps(account, true);
    await expect(decideLogin({ identifier: 'arend', password: 'pw' }, d)).resolves.toEqual({
      ok: true,
      accountId: 'acc-1',
    });
    expect(d.verify).toHaveBeenCalledExactlyOnceWith('pw', 'scrypt$real');
  });

  it('runs scrypt exactly once and refuses alike: unknown, revoked, wrong, malformed, too long', async () => {
    const unknown = deps(null, true);
    expect(await decideLogin({ identifier: 'nobody', password: 'pw' }, unknown)).toEqual({
      ok: false,
    });
    expect(unknown.verify).toHaveBeenCalledExactlyOnceWith('pw', GATE_DUMMY_PASSWORD_HASH);

    const revoked = deps({ ...account, revokedAt: new Date() }, true);
    expect(await decideLogin({ identifier: 'arend', password: 'pw' }, revoked)).toEqual({
      ok: false,
    });
    expect(revoked.verify).toHaveBeenCalledExactlyOnceWith('pw', 'scrypt$real');

    const wrong = deps(account, false);
    expect(await decideLogin({ identifier: 'arend', password: 'nope' }, wrong)).toEqual({
      ok: false,
    });
    expect(wrong.verify).toHaveBeenCalledOnce();

    const malformed = deps(account, true);
    expect(await decideLogin({ identifier: null, password: 'pw' }, malformed)).toEqual({
      ok: false,
    });
    expect(malformed.findAccount).not.toHaveBeenCalled();
    expect(malformed.verify).toHaveBeenCalledExactlyOnceWith('pw', GATE_DUMMY_PASSWORD_HASH);

    const tooLong = deps(account, true);
    expect(await decideLogin({ identifier: 'arend', password: null }, tooLong)).toEqual({
      ok: false,
    });
    expect(tooLong.verify).toHaveBeenCalledOnce();
  });

  it('lets a busy hasher propagate (the action answers "druk", not "wrong password")', async () => {
    const busy = {
      findAccount: async () => account,
      verify: async (): Promise<boolean> => {
        throw new PasswordHasherBusyError();
      },
    };
    await expect(decideLogin({ identifier: 'arend', password: 'pw' }, busy)).rejects.toBeInstanceOf(
      PasswordHasherBusyError,
    );
  });

  it('uses a dummy hash with exactly the current scrypt parameters (same cost as a real one)', () => {
    expect(needsRehash(GATE_DUMMY_PASSWORD_HASH)).toBe(false);
  });
});

describe('gateCookieOptions', () => {
  it('meets the __Host- prefix rules: Secure, Path=/, no Domain; httpOnly and lax', () => {
    const options = gateCookieOptions(8 * 60 * 60);
    expect(options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 28_800,
    });
    expect(options).not.toHaveProperty('domain');
    expect(gateCookieOptions(0).maxAge).toBe(0);
    expect(gateCookieOptions(-5).maxAge).toBe(0);
  });
});
