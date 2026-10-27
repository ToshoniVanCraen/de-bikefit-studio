import 'server-only';
import { cache } from 'react';
import { listPublicServices } from '@/lib/booking/content';
import { getDefaultStudioLocation } from '@/lib/booking/location-store';
import { getSiteSettings } from '@/lib/cms/content';
import { loadOfferCatalogue } from '@/lib/cms/offers-content';
import { defaultSiteSettings } from '@/lib/cms/site-settings';
import { buildCopyTokenLookup, type CopyTokenSources } from './copy-token-values';
import { hasCopyTokens, resolveCopyTokens, type CopyTokenLookup } from './copy-tokens';
import { defaultLocale } from './locale';

/**
 * The copy-token lookup of a request, read from the cached public readers and
 * built ONCE per request (`React.cache`): the settings (`getSiteSettings`), the
 * services the site offers (`listPublicServices`), the offer catalogue
 * (`loadOfferCatalogue`, which the page, the overview and the booking block share
 * as well) and the default studio location. What each token prints is decided by
 * the pure `copy-token-values.ts`; the engine is `copy-tokens.ts`. A page
 * without a token never reaches this module: callers ask {@link resolveCopy},
 * which loads nothing when there is nothing to resolve.
 *
 * Kind: server-only reader (composition: it reads across the booking, offer and
 * CMS areas, which is why it sits in `studio/`). The e-mail sender imports it
 * lazily (`src/lib/email/resolve-copy.ts`), the public renderers directly.
 *
 * Degrades instead of failing (D5): a reader that throws (a missing table, a
 * transport failure) is logged with a fixed code and counts as empty, so a
 * token reads its fallback ("in overleg", "op aanvraag", the settings' schema
 * defaults) and the page renders; the next request reads again.
 */

/** What the builder reads; injected in the unit test, wired to the cached readers below. */
export type CopyTokenReaders = {
  settings: (locale: string) => Promise<CopyTokenSources['settings']>;
  services: (locale: string) => Promise<CopyTokenSources['services']>;
  offers: (locale: string) => Promise<CopyTokenSources['offers']>;
  studioAddress: () => Promise<CopyTokenSources['studioAddress']>;
};

const CACHED_READERS: CopyTokenReaders = {
  settings: (locale) => getSiteSettings(locale),
  services: (locale) => listPublicServices(locale),
  offers: async (locale) => Object.values((await loadOfferCatalogue(locale)).bySlug),
  studioAddress: () => getDefaultStudioLocation(),
};

/** One reader's answer, or its fallback after a fixed log line (never the error: a query's message holds its SQL). */
async function attempt<T>(reader: string, read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    console.error('[copy-tokens] reader_failed', { reader });
    return fallback;
  }
}

export async function loadCopyTokenLookup(
  locale: string,
  readers: CopyTokenReaders = CACHED_READERS,
): Promise<CopyTokenLookup> {
  const [settings, services, offers, studioAddress] = await Promise.all([
    attempt('settings', () => readers.settings(locale), defaultSiteSettings()),
    attempt('services', () => readers.services(locale), []),
    attempt('offers', () => readers.offers(locale), []),
    attempt('studio_location', () => readers.studioAddress(), null),
  ]);
  return buildCopyTokenLookup({ settings, services, offers, studioAddress });
}

/** The request's lookup: one build per request, however many callers ask. */
export const getCopyTokenLookup = cache((locale: string): Promise<CopyTokenLookup> =>
  loadCopyTokenLookup(locale),
);

/**
 * `value` (a string, a block, an offering entry, …) with every copy token
 * resolved, as a copy; the value itself when it holds none. Strings under a key
 * named `html` are escaped, so rich text stays safe. Tokens resolve here for
 * everything a visitor reads that is not a block: the offer page, the overview
 * cards, the booking widget's texts, metadata and JSON-LD.
 */
export async function resolveCopy<T>(value: T, locale: string = defaultLocale): Promise<T> {
  if (!hasCopyTokens(value)) return value;
  return resolveCopyTokens(value, await getCopyTokenLookup(locale));
}
