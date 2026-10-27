import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES, DEFAULT_STUDIO_LOCATION } from '@/lib/booking/defaults';
import { formatDuration } from '@/lib/booking/format';
import { defaultSiteSettings } from '@/lib/cms/site-settings';
import { DEFAULT_OFFERS } from '@/lib/offers/defaults';
import { AUDIENCE_LABELS } from '@/lib/offers/offering-audience';
import { offeringPriceLabel } from '@/lib/offers/offering-labels';
import { scanned } from './content-scan-kit';
import { buildCopyTokenLookup, type CopyTokenOffer } from './copy-token-values';
import {
  DURATION_TOKEN_FALLBACK,
  EXTRA_TOKEN_FALLBACK,
  PRICE_TOKEN_FALLBACK,
  parseCopyToken,
  resolveCopyTokensInText,
  type CopyTokenLookup,
} from './copy-tokens';
import { STUDIO_CONTACT_ADDRESS } from './seed-content/location-section';
import { CONTACT_EMAIL, PHONE_HREF, PHONE_LABEL } from './seed-content/shared';

/**
 * The other half of "copy refers to the master" (Toshoni, 27 Oct 2026): a token that the engine
 * does not know, or that its masters cannot fill in, stays as typed or reads "in overleg" on the
 * site. `content-facts.test.ts` makes sure the texts in code carry tokens instead of facts; this
 * one makes sure every token they carry is real: a name of the set, a service, an offering, an
 * audience and a choice that exist in the defaults. The texts are the ones the facts guard reads
 * (`content-scan-kit.ts`); the masters are the ones a fresh database holds.
 */

/** A fresh database: Instellingen as the seed writes it, the default services and offerings, the studio. */
function freshLookup(): CopyTokenLookup {
  const settings = defaultSiteSettings();
  settings.contact = {
    ...settings.contact,
    phoneLabel: PHONE_LABEL,
    phoneHref: PHONE_HREF,
    email: CONTACT_EMAIL,
    ...STUDIO_CONTACT_ADDRESS,
    addressLines: [...STUDIO_CONTACT_ADDRESS.addressLines],
  };
  const offers: CopyTokenOffer[] = DEFAULT_OFFERS.map((entry) => {
    const { slug, title, priceText } = entry.content;
    const variants = entry.variants.map((variant) => ({
      audience: variant.audience,
      label: AUDIENCE_LABELS[variant.audience],
      serviceId: null,
      serviceSlug: variant.serviceSlug,
      serviceName: null,
      durationMinutes: null,
      requiresGuardian: false,
      priceCents: variant.priceCents,
      bookable: true,
    }));
    const priceLabel = offeringPriceLabel(
      { bookingMode: entry.bookingMode, variants, addonOptions: entry.addonOptions },
      priceText,
    );
    return {
      offer: { id: slug, slug, priceLabel },
      content: { slug, title },
      offering: {
        isListed: entry.isListed,
        isAddon: entry.isAddon,
        addonMinutes: entry.addonMinutes,
        addonOptions: entry.addonOptions,
        variants,
      },
    };
  });
  return buildCopyTokenLookup({
    settings,
    services: DEFAULT_SERVICES.map((service) => ({
      slug: service.slug,
      durationLabel: formatDuration(service.durationMinutes),
    })),
    offers,
    studioAddress: DEFAULT_STUDIO_LOCATION,
  });
}

/** Anything between double braces: also what the engine would leave as typed (a typo, a capital). */
const BRACED = /\{\{([^{}]*)\}\}/g;
const FALLBACKS: ReadonlySet<string> = new Set([
  DURATION_TOKEN_FALLBACK,
  PRICE_TOKEN_FALLBACK,
  EXTRA_TOKEN_FALLBACK,
]);

/** What is wrong with the tokens typed in `text`; empty when every one is real and has a value. */
function problemsIn(text: string, lookup: CopyTokenLookup): string[] {
  const problems: string[] = [];
  for (const match of text.matchAll(BRACED)) {
    const typed = match[0];
    if (!parseCopyToken(match[1].trim())) {
      problems.push(`${typed} is no token of the engine`);
      continue;
    }
    const read = resolveCopyTokensInText(typed, lookup).replace(/\s+/g, ' ').trim();
    if (!read || read.includes('{{') || FALLBACKS.has(read)) {
      problems.push(`${typed} reads “${read}” against the default masters`);
    }
  }
  return problems;
}

describe('the copy tokens typed in the code are real', () => {
  const lookup = freshLookup();

  it('every token in a seed, a default or an e-mail template is known and has a value', () => {
    const violations = scanned.flatMap(({ file, where, text }) =>
      problemsIn(text, lookup).map((problem) => `${file} (${where}): ${problem}`),
    );
    expect(violations).toEqual([]);
  });

  it('looks at a lot of tokens, of every kind', () => {
    const kinds = new Map<string, number>();
    let total = 0;
    for (const { text } of scanned) {
      for (const match of text.matchAll(BRACED)) {
        const token = parseCopyToken(match[1].trim());
        if (!token) continue;
        total += 1;
        kinds.set(token.kind, (kinds.get(token.kind) ?? 0) + 1);
      }
    }
    expect(total).toBeGreaterThan(100);
    for (const kind of ['duration', 'price', 'fact']) {
      expect(kinds.get(kind) ?? 0, kind).toBeGreaterThan(0);
    }
  });

  it('knows what it looks for (the checker itself)', () => {
    for (const text of [
      '{{opvolgin:volwassene}}',
      '{{Telefoon}}',
      '{{duur}}',
      '{{duur:bestaat-niet}}',
      '{{prijs:bestaat-niet:all}}',
      '{{prijs:bikefit-huidige-fiets:senior}}',
      '{{ iets met spaties }}',
    ]) {
      expect(problemsIn(text, lookup), text).toHaveLength(1);
    }
    for (const text of [
      '{{telefoon}}',
      'mailto:{{e-mail}}',
      '{{duur:volwassenenfit}}',
      '{{duur:jeugdfit-pakket}}',
      '{{prijs:bikefit-huidige-fiets:youth-package}}',
      '{{ adres }}',
      'Geen token, wel {accolades} en een { enkele }.',
    ]) {
      expect(problemsIn(text, lookup), text).toEqual([]);
    }
  });
});
