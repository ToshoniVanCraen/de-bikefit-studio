import { describe, expect, it } from 'vitest';

import type { GateConfig } from './config';
import { decideHealthAccess, healthProbeResult } from './health';

const config: GateConfig = {
  secret: 's'.repeat(48),
  healthToken: 'h'.repeat(48),
  databaseUrl: 'postgres://user:pass@host/db',
};

describe('decideHealthAccess', () => {
  it('inactive host → 404 without a body', () => {
    expect(decideHealthAccess({ kind: 'inactive' }, config.healthToken)).toEqual({
      kind: 'respond',
      status: 404,
      body: null,
    });
  });

  it('misconfigured → 503 gate_misconfigured, token irrelevant', () => {
    expect(
      decideHealthAccess({ kind: 'misconfigured', reasons: ['secret'] }, config.healthToken),
    ).toEqual({ kind: 'respond', status: 503, body: { code: 'gate_misconfigured' } });
  });

  it.each([null, '', 'wrong', config.secret])('token %j → 401 gate_auth_failed', (token) => {
    expect(decideHealthAccess({ kind: 'active', config }, token)).toEqual({
      kind: 'respond',
      status: 401,
      body: { code: 'gate_auth_failed' },
    });
  });

  it('valid token → probe', () => {
    expect(decideHealthAccess({ kind: 'active', config }, config.healthToken)).toEqual({
      kind: 'probe',
      config,
    });
  });
});

describe('healthProbeResult', () => {
  it('maps the probe to 200 ok or 503 app_unhealthy', () => {
    expect(healthProbeResult(true)).toEqual({ status: 200, body: { status: 'ok' } });
    expect(healthProbeResult(false)).toEqual({ status: 503, body: { code: 'app_unhealthy' } });
  });
});
