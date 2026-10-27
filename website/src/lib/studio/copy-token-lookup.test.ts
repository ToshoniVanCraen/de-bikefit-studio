import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSiteSettings } from '@/lib/cms/site-settings';
import { resolveCopyTokensInText } from './copy-tokens';
import { loadCopyTokenLookup, resolveCopy, type CopyTokenReaders } from './copy-token-lookup';

/**
 * The builder with stubbed readers: no database, no cache, no Next runtime
 * (`server-only` is aliased to a stub in `vitest.config.ts`). `resolveCopy()`
 * runs on the real wiring, so the five cached readers are mocked below.
 */

vi.mock('@/lib/cms/content', async () => {
  const { defaultSiteSettings: defaults } = await import('@/lib/cms/site-settings');
  return {
    getSiteSettings: vi.fn(async () => {
      const settings = defaults();
      settings.contact = { ...settings.contact, email: 'info@studio.test' };
      return settings;
    }),
  };
});
vi.mock('@/lib/booking/content', () => ({
  listPublicServices: vi.fn(async () => [{ slug: 'volwassenenfit', durationLabel: '2 uur' }]),
}));
vi.mock('@/lib/booking/location-store', () => ({
  getDefaultStudioLocation: vi.fn(async () => null),
}));
vi.mock('@/lib/cms/offers-content', () => ({
  loadOfferCatalogue: vi.fn(async () => ({ bySlug: {} })),
}));

function readers(overrides: Partial<CopyTokenReaders> = {}): CopyTokenReaders {
  return {
    settings: async () => defaultSiteSettings(),
    services: async () => [{ slug: 'volwassenenfit', durationLabel: '2 uur' }],
    offers: async () => [],
    studioAddress: async () => ({
      addressLines: ['Kerkstraat 1'],
      postalCode: '9400',
      city: 'Ninove',
    }),
    ...overrides,
  };
}

const text = '{{duur:volwassenenfit}}|{{adres-studio}}|{{bedrijf}}|{{prijs:weg}}';

let logged: unknown[][] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logged.push(args);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadCopyTokenLookup', () => {
  it('builds the lookup from what the readers return', async () => {
    const lookup = await loadCopyTokenLookup('nl', readers());
    expect(resolveCopyTokensInText(text, lookup)).toBe(
      '2 uur|Kerkstraat 1, 9400 Ninove|Qarakter BV|op aanvraag',
    );
    expect(logged).toEqual([]);
  });

  it('asks every reader for the locale it was given', async () => {
    const settings = vi.fn(async () => defaultSiteSettings());
    const services = vi.fn(async () => []);
    const offers = vi.fn(async () => []);
    await loadCopyTokenLookup('fr', readers({ settings, services, offers }));
    expect(settings).toHaveBeenCalledWith('fr');
    expect(services).toHaveBeenCalledWith('fr');
    expect(offers).toHaveBeenCalledWith('fr');
  });

  it('a reader that throws counts as empty and is logged with a fixed code, nothing else', async () => {
    const failing = async () => {
      throw new Error('select * from cms_services where secret = 1');
    };
    const lookup = await loadCopyTokenLookup(
      'nl',
      readers({ services: failing, studioAddress: failing }),
    );
    // Durations and the studio address are gone, the rest still works.
    expect(resolveCopyTokensInText(text, lookup)).toBe('in overleg||Qarakter BV|op aanvraag');
    expect(logged).toEqual([
      ['[copy-tokens] reader_failed', { reader: 'services' }],
      ['[copy-tokens] reader_failed', { reader: 'studio_location' }],
    ]);
    expect(JSON.stringify(logged)).not.toContain('secret');
  });

  it('with every reader down it still prints the schema defaults and the fallbacks', async () => {
    const failing = async () => {
      throw new Error('down');
    };
    const lookup = await loadCopyTokenLookup(
      'nl',
      readers({
        settings: failing,
        services: failing,
        offers: failing,
        studioAddress: failing,
      }),
    );
    expect(resolveCopyTokensInText(`${text}|{{zetel}}|{{telefoon}}`, lookup)).toBe(
      'in overleg||Qarakter BV|op aanvraag|Weversstraat 7, 1730 Asse|+32 473 95 26 33',
    );
    expect(logged).toHaveLength(4);
  });
});

describe('resolveCopy', () => {
  it('resolves every string of a value on the cached readers', async () => {
    const resolved = await resolveCopy({
      title: 'Mail {{e-mail}}',
      items: [{ html: '<p>{{duur:volwassenenfit}}</p>' }],
    });
    expect(resolved).toEqual({
      title: 'Mail info@studio.test',
      items: [{ html: '<p>2 uur</p>' }],
    });
  });

  it('hands back the very same value, and reads nothing, when there is no token', async () => {
    const { getSiteSettings } = await import('@/lib/cms/content');
    vi.mocked(getSiteSettings).mockClear();
    const value = { title: 'Gewone tekst', note: '{{onbekend}}' };
    expect(await resolveCopy(value)).toBe(value);
    expect(getSiteSettings).not.toHaveBeenCalled();
  });
});
