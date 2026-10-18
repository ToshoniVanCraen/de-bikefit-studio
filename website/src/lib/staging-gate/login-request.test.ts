import { describe, expect, it } from 'vitest';

import {
  boundedGateLoginForm,
  MAX_GATE_LOGIN_BODY_BYTES,
  sameOriginGateLoginPost,
} from './login-request';

const URL = 'https://staging.debikefitstudio.be/api/staging-gate/login';

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request(URL, {
    method: 'POST',
    body,
    headers: {
      host: 'staging.debikefitstudio.be',
      origin: 'https://staging.debikefitstudio.be',
      'content-type': 'application/x-www-form-urlencoded',
      ...headers,
    },
  });
}

describe('dedicated staging login request', () => {
  it('requires the exact HTTPS origin, including the default port', () => {
    expect(sameOriginGateLoginPost(request(''))).toBe(true);
    for (const origin of [
      'https://staging.debikefitstudio.be:8443',
      'http://staging.debikefitstudio.be',
      'https://other.debikefitstudio.be',
      'not-a-url',
      '',
    ]) {
      expect(sameOriginGateLoginPost(request('', { origin }))).toBe(false);
    }
    expect(sameOriginGateLoginPost(request('', { host: 'preview.vercel.app' }))).toBe(false);
  });

  it('accepts a valid long return target after URL-encoding expansion', async () => {
    const next = '/?x=' + '!'.repeat(2028);
    const body = new URLSearchParams({ identifier: 'reviewer', password: 'pass', next }).toString();
    expect(body.length).toBeGreaterThan(4096);
    expect((await boundedGateLoginForm(request(body)))?.get('next')).toBe(next);
  });

  it('rejects an oversized body even without a Content-Length header', async () => {
    expect(
      await boundedGateLoginForm(request('x'.repeat(MAX_GATE_LOGIN_BODY_BYTES + 1))),
    ).toBeNull();
    expect(
      await boundedGateLoginForm(
        request('identifier=a', { 'content-length': String(MAX_GATE_LOGIN_BODY_BYTES + 1) }),
      ),
    ).toBeNull();
  });

  it('accepts only URL-encoded form data', async () => {
    expect(
      await boundedGateLoginForm(
        request('{"password":"x"}', { 'content-type': 'application/json' }),
      ),
    ).toBeNull();
  });
});
