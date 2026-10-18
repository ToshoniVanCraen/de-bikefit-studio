import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GateConfig } from './config';
import {
  gateRequest,
  misconfiguredResponse,
  runsLegacyMiddleware,
  stampGateHeaders,
  type GateDeps,
  type GateSessionLookup,
} from './middleware';
import { formatGateCookie, gateTokenTag, generateGateToken } from './token';

const ORIGIN = 'https://staging.debikefitstudio.be';
const config: GateConfig = {
  secret: 's'.repeat(48),
  healthToken: 'h'.repeat(48),
  databaseUrl: 'postgres://user:pass@host/db',
};
const NOW = new Date('2026-10-18T10:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function row(overrides: Partial<GateSessionLookup> = {}): GateSessionLookup {
  return {
    id: 'session-1',
    createdAt: ago(60 * 60 * 1000),
    lastUsedAt: ago(10 * 1000),
    revokedAt: null,
    accountRevokedAt: null,
    ...overrides,
  };
}

function deps(session: GateSessionLookup | null | Error = row()) {
  const findSession = vi.fn(async () => {
    if (session instanceof Error) throw session;
    return session;
  });
  const touchSession = vi.fn(async () => {});
  const d: GateDeps = { config, now: () => NOW, findSession, touchSession };
  return { d, findSession, touchSession };
}

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: init.method ?? 'GET',
    headers: init.headers,
  });
}

async function validCookie(secret = config.secret): Promise<{ cookie: string; tag: string }> {
  const token = generateGateToken();
  const tag = await gateTokenTag(secret, token);
  return { cookie: `__Host-staging-gate=${formatGateCookie(token, tag)}`, tag };
}

function respond(outcome: Awaited<ReturnType<typeof gateRequest>>): NextResponse {
  if (outcome.kind !== 'respond') throw new Error('expected a response');
  return outcome.response;
}

function expectCleared(response: NextResponse) {
  const setCookie = response.headers.get('set-cookie') ?? '';
  expect(setCookie).toContain('__Host-staging-gate=;');
  expect(setCookie).toMatch(/Max-Age=0/i);
  expect(setCookie).toMatch(/Secure/i);
  expect(setCookie).toMatch(/Path=\//i);
}

afterEach(() => vi.restoreAllMocks());

describe('gateRequest: public paths and robots', () => {
  it.each([
    ['GET', '/staging-toegang'],
    ['POST', '/api/staging-gate/login'],
    ['GET', '/favicon.ico'],
    ['GET', '/brand/logo.svg'],
    ['POST', '/api/webhooks/stripe'],
  ])('%s %s passes without a session or query', async (method, path) => {
    const { d, findSession } = deps();
    expect(await gateRequest(request(path, { method }), d)).toEqual({ kind: 'pass' });
    expect(findSession).not.toHaveBeenCalled();
  });

  it('blocks an anonymous Server Action POST to the public login page', async () => {
    const { d, findSession } = deps();
    const response = respond(
      await gateRequest(
        request('/staging-toegang', {
          method: 'POST',
          headers: { 'Next-Action': 'known-protected-action-id' },
        }),
        d,
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('/staging-toegang');
    expect(findSession).not.toHaveBeenCalled();
  });

  it('gates the logout page', async () => {
    const { d } = deps();
    expect(respond(await gateRequest(request('/staging-toegang/afmelden'), d)).status).toBe(302);
  });

  it('denies the optimizer even with machine or reviewer credentials', async () => {
    const { d, findSession } = deps();
    const { cookie } = await validCookie();
    const path = '/_next/image?url=%2Fimages%2Feditorial%2Fbikefit-studio-v1.webp&w=640&q=75';
    const headersCases: Record<string, string>[] = [
      {},
      { 'x-staging-gate-token': config.healthToken },
      { cookie },
    ];
    for (const headers of headersCases) {
      expect(respond(await gateRequest(request(path, { headers }), d)).status).toBe(404);
    }
    expect(findSession).not.toHaveBeenCalled();
  });

  it('answers robots.txt inline', async () => {
    const { d, findSession } = deps();
    const response = respond(await gateRequest(request('/robots.txt'), d));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await response.text()).toBe('User-agent: *\nDisallow: /');
    expect(findSession).not.toHaveBeenCalled();
  });
});

describe('gateRequest: machine token', () => {
  it.each(['GET', 'HEAD'])('valid token on %s passes with no store call', async (method) => {
    const { d, findSession } = deps();
    const req = request('/aanbod', {
      method,
      headers: { 'x-staging-gate-token': config.healthToken },
    });
    expect(await gateRequest(req, d)).toEqual({ kind: 'pass' });
    expect(findSession).not.toHaveBeenCalled();
  });

  it('invalid token → 401 gate_auth_failed, even with a valid cookie', async () => {
    const { d, findSession } = deps();
    const { cookie } = await validCookie();
    const req = request('/aanbod', { headers: { 'x-staging-gate-token': 'wrong', cookie } });
    const response = respond(await gateRequest(req, d));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: 'gate_auth_failed' });
    expect(findSession).not.toHaveBeenCalled();
  });

  it('valid token on POST → 401', async () => {
    const { d } = deps();
    const req = request('/aanbod', {
      method: 'POST',
      headers: { 'x-staging-gate-token': config.healthToken },
    });
    const response = respond(await gateRequest(req, d));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: 'gate_auth_failed' });
  });

  it('the health route refuses cookie auth and accepts the token', async () => {
    const { d, findSession } = deps();
    const { cookie } = await validCookie();
    const withCookie = respond(
      await gateRequest(request('/api/staging-gate/health', { headers: { cookie } }), d),
    );
    expect(withCookie.status).toBe(401);
    expect(await withCookie.json()).toEqual({ code: 'gate_auth_failed' });
    expect(findSession).not.toHaveBeenCalled();

    const withToken = request('/api/staging-gate/health', {
      headers: { 'x-staging-gate-token': config.healthToken },
    });
    expect(await gateRequest(withToken, d)).toEqual({ kind: 'pass' });
  });
});

describe('gateRequest: session cookie', () => {
  it('no cookie → 302 to the login page with the return path', async () => {
    const { d, findSession } = deps();
    const response = respond(await gateRequest(request('/aanbod?type=road'), d));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe('/staging-toegang');
    expect(location.searchParams.get('next')).toBe('/aanbod?type=road');
    expect(location.searchParams.has('reden')).toBe(false);
    expect(findSession).not.toHaveBeenCalled();
  });

  it('no cookie on POST → 302 without a return path', async () => {
    const { d } = deps();
    const response = respond(await gateRequest(request('/aanbod', { method: 'POST' }), d));
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location')!).search).toBe('');
  });

  it('garbage cookie → 302 without reden, cookie cleared, zero store calls', async () => {
    const { d, findSession } = deps();
    const req = request('/', { headers: { cookie: '__Host-staging-gate=v1.nope.nope' } });
    const response = respond(await gateRequest(req, d));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.has('reden')).toBe(false);
    expect(location.searchParams.get('next')).toBe('/');
    expectCleared(response);
    expect(findSession).not.toHaveBeenCalled();
  });

  it('forged tag → 302 reden=verlopen, cookie cleared, zero store calls', async () => {
    const { d, findSession } = deps();
    const { cookie } = await validCookie('x'.repeat(48));
    const response = respond(await gateRequest(request('/aanbod', { headers: { cookie } }), d));
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location')!).searchParams.get('reden')).toBe('verlopen');
    expectCleared(response);
    expect(findSession).not.toHaveBeenCalled();
  });

  it('valid cookie + same-time row → pass, looked up by the recomputed tag, no touch', async () => {
    const { d, findSession, touchSession } = deps(row({ lastUsedAt: NOW }));
    const { cookie, tag } = await validCookie();
    expect(await gateRequest(request('/aanbod', { headers: { cookie } }), d)).toEqual({
      kind: 'pass',
    });
    expect(findSession).toHaveBeenCalledWith(tag);
    expect(touchSession).not.toHaveBeenCalled();
  });

  it('valid cookie with recent activity → pass and touch', async () => {
    const { d, touchSession } = deps(row({ lastUsedAt: ago(1000) }));
    const { cookie } = await validCookie();
    expect(await gateRequest(request('/aanbod', { headers: { cookie } }), d)).toEqual({
      kind: 'pass',
    });
    expect(touchSession).toHaveBeenCalledWith('session-1', NOW);
  });

  it('a touch failure fails closed rather than granting an unrecorded activity', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { d, touchSession } = deps(row({ lastUsedAt: ago(5 * 60 * 1000) }));
    touchSession.mockRejectedValueOnce(new TypeError('secret detail'));
    const { cookie } = await validCookie();
    const outcome = await gateRequest(request('/aanbod', { headers: { cookie } }), d);
    expect(outcome.kind).toBe('respond');
    if (outcome.kind !== 'respond') throw new Error('expected gate response');
    expect(outcome.response.status).toBe(503);
    expect(await outcome.response.json()).toEqual({ code: 'gate_unavailable' });
    expect(log).toHaveBeenCalledWith('[staging-gate] touch_failed TypeError');
  });

  it.each([
    ['unknown', null],
    ['revoked', row({ revokedAt: ago(1000) })],
    ['account revoked', row({ accountRevokedAt: ago(1000) })],
    ['absolute expiry', row({ createdAt: ago(8 * 60 * 60 * 1000) })],
    ['idle expiry', row({ lastUsedAt: ago(30 * 60 * 1000) })],
  ])('%s → 302 reden=verlopen with cleared cookie', async (_label, session) => {
    const { d, touchSession } = deps(session);
    const { cookie } = await validCookie();
    const response = respond(await gateRequest(request('/aanbod?x=1', { headers: { cookie } }), d));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location')!);
    expect(location.searchParams.get('reden')).toBe('verlopen');
    expect(location.searchParams.get('next')).toBe('/aanbod?x=1');
    expectCleared(response);
    expect(touchSession).not.toHaveBeenCalled();
  });

  it('/api paths get 401 JSON instead of a redirect', async () => {
    const { d } = deps(row({ revokedAt: ago(1000) }));
    const bare = respond(await gateRequest(request('/api/cms/media/1'), d));
    expect(bare.status).toBe(401);
    expect(await bare.json()).toEqual({ code: 'gate_session_required' });

    const { cookie } = await validCookie();
    const revoked = respond(
      await gateRequest(request('/api/cms/media/1', { headers: { cookie } }), d),
    );
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toEqual({ code: 'gate_session_required' });
    expectCleared(revoked);
  });

  it('store error → 503 gate_unavailable, logged by error name only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { d } = deps(new RangeError('postgres://user:pass@host leaked'));
    const { cookie } = await validCookie();
    const response = respond(await gateRequest(request('/aanbod', { headers: { cookie } }), d));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'gate_unavailable' });
    expect(log).toHaveBeenCalledWith('[staging-gate] store_error RangeError');
  });
});

describe('headers and misconfiguration', () => {
  it('stamps no-store and noindex', () => {
    const response = stampGateHeaders(NextResponse.next());
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('misconfigured → 503 gate_misconfigured, stamped, logged once', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const first = misconfiguredResponse(['secret', 'git_ref']);
    misconfiguredResponse(['git_ref', 'secret']);
    expect(first.status).toBe(503);
    expect(await first.json()).toEqual({ code: 'gate_misconfigured' });
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[staging-gate] misconfigured git_ref,secret');
  });
});

describe('runsLegacyMiddleware (old matcher, reproduced)', () => {
  it.each([
    ['/', true],
    ['/aanbod', true],
    ['/admin/login', true],
    ['/data.json', true],
    ['/robots.txt', true],
    ['/api/cms/media/1', true],
    ['/api/file.png', true],
    ['/trpc/x', true],
    ['/_next/image', false],
    ['/_next/static/chunk.js', false],
    ['/_nextfoo', false],
    ['/logo.svg', false],
    ['/brand/logo-dark.png', false],
    ['/app.js', false],
    ['/site.webmanifest', false],
    ['/favicon.ico', false],
    ['/docs/offerte.docx', false],
    ['/a.png/b', false],
  ])('%s → %s', (pathname, expected) => {
    expect(runsLegacyMiddleware(pathname)).toBe(expected);
  });
});
