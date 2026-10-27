import { formatPostalAddress, formatPriceInProse } from '@/lib/booking/format';
import type { SiteSettings } from '@/lib/cms/site-settings';
import { addonOptionsFor, addonProseLabel, type AddonSource } from '@/lib/offers/addons';
import type { CatalogueOffer } from '@/lib/offers/catalogue';
import type { ResolvedOffering } from '@/lib/offers/offering';
import type { OfferingContent } from '@/lib/offers/offering-content';
import {
  extraChoiceKey,
  priceLineSlugs,
  resolveCopyTokensInText,
  variantPriceKey,
  type CopyTokenLookup,
  type FactToken,
} from './copy-tokens';
import { LEGAL_IDENTITY } from './legal';
import { monthsInWords } from './months-in-words';

/**
 * The values behind the copy tokens (`copy-tokens.ts`), built from plain data:
 * every master a token refers to, read by `copy-token-lookup.ts` and handed in
 * here. Plain module: no I/O, no Next, no `server-only`; unit-tested in
 * `copy-token-values.test.ts`, so what each token prints is checked without a
 * database.
 *
 * Where each token gets its text (the table in docs/cms-architecture.md §5,
 * "Copy tokens: one master per fact"):
 *
 *  - `duur`            the booking service's duration as the widget shows it
 *  - `prijs:<slug>`    the offering's price line as `/aanbod` shows it
 *                      (`CatalogueOffer.priceLabel`); a free-text price in it is
 *                      resolved first, and its own line (or a loop back to it)
 *                      inside a price text reads "op aanvraag" instead of
 *                      recursing (`priceLinesOf`)
 *  - `prijs:<slug>:<audience>`  that variant's cents in prose, "€ 275"; never
 *                      the price text
 *  - `extra`           "€ 75 en 30 minuten extra" per extra or per choice
 *  - facts             `contact`, `business`, `rules` of the settings and the
 *                      default studio location
 *
 * Only offerings shown on the website count, like `duur` only counts services
 * the site offers: a hidden offering reads the fallback.
 */

/** A postal address as `formatPostalAddress()` takes it. */
export type PostalAddress = {
  addressLines: readonly string[];
  postalCode: string;
  city: string;
};

/** The part of a catalogue entry the tokens read (`CatalogueOfferEntry` fits). */
export type CopyTokenOffer = {
  offer: Pick<CatalogueOffer, 'id' | 'slug' | 'priceLabel'>;
  content: Pick<OfferingContent, 'slug' | 'title'>;
  offering: Pick<
    ResolvedOffering,
    'isListed' | 'isAddon' | 'addonMinutes' | 'addonOptions' | 'variants'
  >;
};

export type CopyTokenSources = {
  settings: Pick<SiteSettings, 'contact' | 'business' | 'rules'>;
  /** The services the site offers: slug and the duration label of the widget. */
  services: ReadonlyArray<{ slug: string; durationLabel: string }>;
  /** Every offering of the catalogue, shown or not. */
  offers: readonly CopyTokenOffer[];
  /** The default studio location of Beheer → Locaties; `null` when there is none. */
  studioAddress: PostalAddress | null;
};

/**
 * Only a phone link of digits and the usual separators passes: `{{telefoon-href}}`
 * lands in `href` attributes of copy that was sanitised BEFORE it was resolved,
 * so the value must be a plain `tel:` link whatever the setting holds.
 */
const TEL_HREF = /^tel:[+0-9][0-9 ()./-]{2,29}$/i;

/**
 * `{{e-mail}}` is the bare address and may sit in an `href` (`mailto:{{e-mail}}`, or the token
 * alone): an address has no scheme, no space, no quote and no bracket, whatever the setting holds.
 */
const EMAIL_ADDRESS = /^[^\s@:<>"'()]+@[^\s@<>"'()]+\.[^\s@<>"'()]+$/;

function telephone(contact: SiteSettings['contact']): { label: string; href: string } {
  const label = contact.phoneLabel.trim();
  const href = contact.phoneHref.trim();
  // The pair or nothing, like the offer page and the gift voucher: a label with a broken link is the constant pair.
  return label && TEL_HREF.test(href)
    ? { label, href }
    : { label: LEGAL_IDENTITY.phoneLabel, href: LEGAL_IDENTITY.phoneHref };
}

function factsOf(
  settings: CopyTokenSources['settings'],
  studioAddress: PostalAddress | null,
): Record<FactToken, string> {
  const { contact, business, rules } = settings;
  const phone = telephone(contact);
  const contactAddress = formatPostalAddress(contact);
  const studio = studioAddress ? formatPostalAddress(studioAddress) : '';
  return {
    telefoon: phone.label,
    'telefoon-href': phone.href,
    'e-mail': EMAIL_ADDRESS.test(contact.email.trim()) ? contact.email.trim() : '',
    // The studio is one place: when one master has no address, the other speaks for it.
    adres: contactAddress || studio,
    'adres-studio': studio || contactAddress,
    bedrijf: business.legalName.trim(),
    zetel: formatPostalAddress({
      addressLines: business.seatAddressLines,
      postalCode: business.seatPostalCode,
      city: business.seatCity,
    }),
    kbo: business.enterpriseNumber.trim(),
    btw: business.vatNumber.trim(),
    'opvolging:volwassene': monthsInWords(rules.followUpMonthsAdult),
    'opvolging:jeugd-pakket': monthsInWords(rules.followUpMonthsYouthPackage),
    'tweede-bezoek-gratis': monthsInWords(rules.secondVisitFreeMonths),
    'cadeaubon-geldigheid': monthsInWords(rules.voucherValidityMonths),
  };
}

/**
 * One sentence per extra (an extra without choices) or per choice, the same
 * options the booking widget offers (`addonOptionsFor()`): an extra that is
 * hidden, has no time or no price is left out and reads the fallback.
 */
function extrasOf(shown: readonly CopyTokenOffer[]): {
  extraBySlug: Map<string, string>;
  extraChoiceByKey: Map<string, string>;
} {
  const extraBySlug = new Map<string, string>();
  const extraChoiceByKey = new Map<string, string>();
  const sources: AddonSource[] = shown.map(({ offer, content, offering }) => ({
    id: offer.id,
    content: { slug: content.slug, title: content.title },
    settings: offering,
  }));
  for (const source of sources) {
    if (!source.settings.isAddon) continue;
    // The price of an extra without choices depends on the audience of the offering it is added to; "all" is the single option.
    const host = { id: '', settings: { addonIds: [source.id] } };
    for (const option of addonOptionsFor(host, 'all', sources)) {
      if (option.optionKey === null) {
        extraBySlug.set(source.content.slug, addonProseLabel(option));
      } else {
        extraChoiceByKey.set(
          extraChoiceKey(source.content.slug, option.optionKey),
          addonProseLabel(option),
        );
      }
    }
  }
  return { extraBySlug, extraChoiceByKey };
}

export function buildCopyTokenLookup(sources: CopyTokenSources): CopyTokenLookup {
  const shown = sources.offers.filter((entry) => entry.offering.isListed);

  const priceByVariant = new Map<string, string>();
  for (const { offer, offering } of shown) {
    for (const variant of offering.variants) {
      if (variant.priceCents == null) continue;
      priceByVariant.set(
        variantPriceKey(offer.slug, variant.audience),
        formatPriceInProse(variant.priceCents),
      );
    }
  }

  const base: CopyTokenLookup = {
    durationBySlug: new Map(
      sources.services.map((service) => [service.slug, service.durationLabel]),
    ),
    priceLineBySlug: new Map(),
    priceByVariant,
    ...extrasOf(shown),
    facts: factsOf(sources.settings, sources.studioAddress),
  };

  return { ...base, priceLineBySlug: priceLinesOf(shown, base) };
}

/**
 * The price line of every shown offering, ready to print. A line is usually a list of
 * prices, but an offering that is asked for may have a free-text price ("Gratis binnen
 * {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:<slug>:all}}"): that text is resolved
 * once, against everything the lookup knows, and printed as it is. A `{{prijs:<slug>}}`
 * inside such a text prints the line of that other offering, resolved the same way; the
 * line being resolved (its own, or one that leads back to it) is not ready yet and reads
 * "op aanvraag" instead of recursing.
 */
function priceLinesOf(
  shown: readonly CopyTokenOffer[],
  base: CopyTokenLookup,
): ReadonlyMap<string, string> {
  const raw = new Map(shown.map(({ offer }) => [offer.slug, offer.priceLabel]));
  const ready = new Map<string, string>();
  const resolving = new Set<string>();
  const resolve = (slug: string): void => {
    const text = raw.get(slug);
    if (text === undefined || ready.has(slug) || resolving.has(slug)) return;
    resolving.add(slug);
    for (const other of priceLineSlugs(text)) resolve(other);
    ready.set(slug, resolveCopyTokensInText(text, { ...base, priceLineBySlug: ready }));
    resolving.delete(slug);
  };
  for (const slug of raw.keys()) resolve(slug);
  return ready;
}
