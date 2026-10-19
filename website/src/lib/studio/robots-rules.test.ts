import { describe, expect, it } from 'vitest';
import { NEVER_CRAWLED, robotsRules } from './robots-rules';

const SITEMAP = 'https://www.debikefitstudio.be/sitemap.xml';
const HOST = 'https://www.debikefitstudio.be';

describe('robotsRules', () => {
  it('blocks every crawler while indexing is off, but still names the sitemap', () => {
    expect(robotsRules({ allowIndexing: false, sitemapUrl: SITEMAP, host: HOST })).toEqual({
      rules: [{ userAgent: '*', disallow: '/' }],
      sitemap: SITEMAP,
    });
  });

  it('opens the studio site when indexing is on and keeps the admin, API and legacy shop out', () => {
    const rules = robotsRules({ allowIndexing: true, sitemapUrl: SITEMAP, host: HOST });
    expect(rules.host).toBe(HOST);
    expect(rules.sitemap).toBe(SITEMAP);
    expect(rules.rules).toEqual([{ userAgent: '*', allow: '/', disallow: [...NEVER_CRAWLED] }]);
    for (const path of ['/admin', '/api', '/shop', '/webshop', '/checkout', '/account', '/blog']) {
      expect(NEVER_CRAWLED).toContain(path);
    }
    // The studio's own pages are not in the list.
    for (const path of ['/', '/aanbod', '/bikefit', '/afspraak', '/cadeaubon', '/privacy']) {
      expect(NEVER_CRAWLED).not.toContain(path);
    }
  });
});
