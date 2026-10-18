import { describe, expect, it } from 'vitest';

import { shouldShowGateBanner } from './banner-policy';

const HOST = 'staging.debikefitstudio.be';

describe('shouldShowGateBanner', () => {
  it('shows on the staging host for ordinary pages', () => {
    expect(shouldShowGateBanner(HOST, '/')).toBe(true);
    expect(shouldShowGateBanner(HOST, '/aanbod')).toBe(true);
    expect(shouldShowGateBanner(HOST, '/admin/login')).toBe(true);
    expect(shouldShowGateBanner(HOST, '')).toBe(true);
  });

  it('follows the middleware host rule: case and a trailing dot are ignored', () => {
    expect(shouldShowGateBanner('Staging.DeBikefitStudio.be', '/')).toBe(true);
    expect(shouldShowGateBanner(`${HOST}.`, '/')).toBe(true);
  });

  it('never shows on any other host', () => {
    for (const host of [
      'debikefitstudio.be',
      'www.debikefitstudio.be',
      `www.${HOST}`,
      `${HOST}.evil.com`,
      `evil-${HOST}`,
      'de-bikefit-studio-git-staging-toshoni.vercel.app',
      'localhost',
      '127.0.0.1',
      '',
    ]) {
      expect(shouldShowGateBanner(host, '/')).toBe(false);
    }
  });

  it('is hidden on the login page and everything under it', () => {
    expect(shouldShowGateBanner(HOST, '/staging-toegang')).toBe(false);
    expect(shouldShowGateBanner(HOST, '/staging-toegang/')).toBe(false);
    expect(shouldShowGateBanner(HOST, '/staging-toegang/afmelden')).toBe(false);
  });

  it('matches the gate path by segment, not by prefix', () => {
    expect(shouldShowGateBanner(HOST, '/staging-toegangen')).toBe(true);
    expect(shouldShowGateBanner(HOST, '/over/staging-toegang')).toBe(true);
  });
});
