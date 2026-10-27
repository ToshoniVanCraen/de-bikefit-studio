import { describe, expect, it, vi } from 'vitest';
import { pageSeoSchema } from '@/lib/cms/blocks';
import { defaultSiteSettings } from '@/lib/cms/site-settings';
import { EMPTY_OFFERING_CONTENT } from '@/lib/offers/offering-content';
import { buildOfferMetadata, buildPageMetadata } from './seo';
import type { StudioPage } from './site';

/**
 * Copy tokens in the meta tags (27 Oct 2026): a CMS page's meta title and
 * description, its share (OG) texts and the site-wide defaults they fall back
 * to, and an offering's meta description, are resolved before they reach
 * `<head>`. The lookup and the site data layer are doubles: what is under test
 * is which texts are resolved and where they end up.
 */

vi.mock('./copy-token-lookup', async () => {
  const { emptyCopyTokenLookup, hasCopyTokens, resolveCopyTokens, variantPriceKey } =
    await import('./copy-tokens');
  const base = emptyCopyTokenLookup();
  const lookup = {
    ...base,
    priceByVariant: new Map([[variantPriceKey('bikefit-huidige-fiets', 'adult'), '€ 275']]),
    facts: { ...base.facts, bedrijf: 'Qarakter BV', telefoon: '+32 473 95 26 33' },
  };
  return {
    resolveCopy: async <T>(value: T): Promise<T> =>
      hasCopyTokens(value) ? resolveCopyTokens(value, lookup) : value,
  };
});
vi.mock('./site', () => ({
  absoluteUrl: (path: string) => `https://studio.test${path}`,
  resolveMedia: async () => null,
}));

function studioPage(seo: Record<string, unknown>, slug = 'bikefit'): StudioPage {
  const settings = defaultSiteSettings();
  settings.seo = {
    ...settings.seo,
    defaultMetaTitle: 'Studio van {{bedrijf}}',
    defaultMetaDescription: 'Bel {{telefoon}} voor een bikefit.',
  };
  return {
    locale: 'nl',
    settings,
    canonical: `https://studio.test/${slug}`,
    path: `/${slug}`,
    parents: [],
    page: {
      id: 'page-1',
      locale: 'nl',
      slug,
      translationGroup: 'g',
      title: 'Bikefit',
      kind: 'default',
      publishedAt: '2026-10-27T08:00:00.000Z',
      updatedAt: '2026-10-27T08:00:00.000Z',
      snapshot: {
        version: 1,
        locale: 'nl',
        slug,
        translationGroup: 'g',
        title: 'Bikefit',
        kind: 'default',
        publishedAt: '2026-10-27T08:00:00.000Z',
        seo: pageSeoSchema.parse(seo),
        blocks: [],
      },
    },
  };
}

describe('buildPageMetadata: copy tokens', () => {
  it('resolves the meta title and description and the share texts of the page', async () => {
    const metadata = await buildPageMetadata(
      studioPage({
        metaTitle: 'Bikefit door {{bedrijf}}',
        metaDescription: 'Een bikefit vanaf {{prijs:bikefit-huidige-fiets:adult}}.',
        ogTitle: '{{bedrijf}} — bikefit',
        ogDescription: 'Bel {{telefoon}}',
      }),
    );
    expect(metadata.title).toEqual({ absolute: 'Bikefit door Qarakter BV · De Bikefit Studio' });
    expect(metadata.description).toBe('Een bikefit vanaf € 275.');
    expect(metadata.openGraph).toMatchObject({
      title: 'Qarakter BV — bikefit',
      description: 'Bel +32 473 95 26 33',
    });
    expect(metadata.twitter).toMatchObject({
      title: 'Qarakter BV — bikefit',
      description: 'Bel +32 473 95 26 33',
    });
    expect(JSON.stringify(metadata)).not.toContain('{{');
  });

  it('resolves the site-wide defaults a page without its own texts falls back to', async () => {
    const metadata = await buildPageMetadata(studioPage({}));
    expect(metadata.description).toBe('Bel +32 473 95 26 33 voor een bikefit.');
    const home = await buildPageMetadata(studioPage({}, ''));
    expect(home.title).toEqual({ absolute: 'Studio van Qarakter BV' });
  });

  it('resolves the page title the meta title falls back to', async () => {
    const studio = studioPage({});
    studio.page.title = 'Bikefit bij {{bedrijf}}';
    const metadata = await buildPageMetadata(studio);
    expect(metadata.title).toEqual({ absolute: 'Bikefit bij Qarakter BV · De Bikefit Studio' });
  });

  it('leaves a page without a token as it was', async () => {
    const metadata = await buildPageMetadata(
      studioPage({ metaTitle: 'Gewone titel', metaDescription: 'Gewone omschrijving.' }),
    );
    expect(metadata.title).toEqual({ absolute: 'Gewone titel · De Bikefit Studio' });
    expect(metadata.description).toBe('Gewone omschrijving.');
  });
});

describe('buildOfferMetadata: copy tokens', () => {
  const settings = defaultSiteSettings();
  settings.seo = { ...settings.seo, defaultMetaDescription: 'Bel {{telefoon}}.' };

  const build = (content: Partial<typeof EMPTY_OFFERING_CONTENT>) =>
    buildOfferMetadata({
      content: { ...EMPTY_OFFERING_CONTENT, title: 'Bikefit', ...content },
      path: '/aanbod/bikefit-huidige-fiets',
      settings,
      locale: 'nl',
    });

  it('resolves the meta description of the offering', async () => {
    const metadata = await build({
      metaDescription: 'Bikefit voor {{prijs:bikefit-huidige-fiets:adult}}, door {{bedrijf}}.',
    });
    expect(metadata.description).toBe('Bikefit voor € 275, door Qarakter BV.');
    expect(metadata.openGraph).toMatchObject({
      description: 'Bikefit voor € 275, door Qarakter BV.',
    });
  });

  it('resolves the summary, the intro and the site default it falls back to', async () => {
    expect(
      (await build({ summary: 'Vanaf {{prijs:bikefit-huidige-fiets:adult}}' })).description,
    ).toBe('Vanaf € 275');
    expect((await build({ intro: 'Door {{bedrijf}}' })).description).toBe('Door Qarakter BV');
    expect((await build({})).description).toBe('Bel +32 473 95 26 33.');
  });
});
