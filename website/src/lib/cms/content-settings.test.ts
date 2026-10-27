import { describe, expect, it, vi } from 'vitest';
import { getSiteSettings } from './content';
import { defaultSiteSettings } from './site-settings';

/**
 * `getSiteSettings()` answers every group, also when the data cache hands back a
 * copy from before a group existed: the cache outlives a deploy, so for up to its
 * revalidate window a copy cached before `business` and `rules` (27 Oct 2026)
 * lacks them. The cache is replaced by a stale copy; the database is never read.
 */

const cache = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('next/cache', () => ({
  unstable_cache: () => async () => cache.value,
}));
vi.mock('@/db/cms', () => ({
  getCmsDb: async () => {
    throw new Error('the database must not be read: the cache answers');
  },
}));

describe('getSiteSettings with a copy cached before a group existed', () => {
  it('fills the missing groups with their schema defaults and keeps the others as cached', async () => {
    const full = defaultSiteSettings();
    const { business, rules, ...stale } = full;
    void business;
    void rules;
    cache.value = { ...stale, contact: { ...full.contact, email: 'info@studio.test' } };

    const settings = await getSiteSettings('nl');
    expect(settings.business).toEqual(full.business);
    expect(settings.rules).toEqual(full.rules);
    expect(settings.contact.email).toBe('info@studio.test');
    expect(Object.keys(settings).sort()).toEqual(Object.keys(full).sort());
  });

  it('is the cached copy when it is complete', async () => {
    const full = defaultSiteSettings();
    full.rules = { ...full.rules, followUpMonthsAdult: 9 };
    cache.value = full;
    expect((await getSiteSettings('nl')).rules.followUpMonthsAdult).toBe(9);
  });
});
