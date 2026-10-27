import { formatDuration, formatPrice } from '@/lib/booking/format';
import { OFFER_DURATION_FALLBACK, OFFER_PRICE_FALLBACK, offerDurationLabel } from './catalogue';
import type { AddonChoice, ResolvedOffering, ResolvedVariant } from './offering';

/**
 * The Kostprijs and Duur lines of an offering, as the offer page, the overview
 * cards and Beheer print them. Plain module: no I/O, no Next, no `server-only`;
 * unit-tested in `offering-labels.test.ts`. Split from `./offering.ts` (past
 * the file-size limit), which re-exports it, so callers keep importing from
 * there.
 *
 * Prices are structured data first: the variants' cents (`cms_offering_variants`)
 * are the price. An offering that is asked for may carry a free-text Kostprijs
 * instead (`cms_offerings.price_text`, 27 Oct 2026: "Gratis binnen 6 maanden na
 * je fit, daarna € 75"), the same way it carries a free-text Duur; the cents
 * stay what the structured data (JSON-LD, the extras' totals) uses.
 */

/** One variant's price: "€ 150,00" or "Prijs op aanvraag". */
export function variantPriceLabel(variant: Pick<ResolvedVariant, 'priceCents'>): string {
  return variant.priceCents != null ? formatPrice(variant.priceCents) : OFFER_PRICE_FALLBACK;
}

/**
 * The free-text Kostprijs that counts: only for an offering that is asked for
 * (a direct offering is priced by its services), trimmed; '' when there is none.
 */
export function offeringPriceText(
  offering: Pick<ResolvedOffering, 'bookingMode'>,
  priceText: string | null | undefined,
): string {
  return offering.bookingMode === 'enquiry' ? (priceText ?? '').trim() : '';
}

/**
 * The offering's Kostprijs line: the free text of an offering that is asked
 * for, else "Prijs op aanvraag" while no variant has a price; one amount for a
 * single option; per variant otherwise ("Volwassene € 275,00 · Jeugd – eenmalig
 * op aanvraag"). Never an invented amount.
 */
export function offeringPriceLabel(
  offering: Pick<ResolvedOffering, 'bookingMode' | 'variants'> & { addonOptions?: AddonChoice[] },
  priceText = '',
): string {
  const text = offeringPriceText(offering, priceText);
  if (text) return text;
  // An extra with choices is priced per choice ("Zelfde type fiets € 75,00 · Ander type fiets € 150,00").
  if (offering.addonOptions?.length) {
    return offering.addonOptions
      .map((choice) => `${choice.label} ${formatPrice(choice.priceCents)}`)
      .join(' · ');
  }
  const { variants } = offering;
  if (!variants.some((variant) => variant.priceCents != null)) return OFFER_PRICE_FALLBACK;
  if (variants.length === 1) return variantPriceLabel(variants[0]);
  return variants
    .map(
      (variant) =>
        `${variant.label} ${variant.priceCents != null ? formatPrice(variant.priceCents) : 'op aanvraag'}`,
    )
    .join(' · ');
}

/**
 * The offering's Duur line. Direct: from the variants' active services
 * ("Volwassene: 1 u 30 min · Jeugd – eenmalig: 1 uur"), never the editorial
 * text. Enquiry: the editorial text on the offer page (else "Duur in overleg").
 */
export function offeringDurationLabel(
  offering: Pick<ResolvedOffering, 'bookingMode' | 'variants'> & { addonOptions?: AddonChoice[] },
  editorialDuration: string,
): string {
  // An extra with choices: the time of each choice, whatever the booking mode.
  if (offering.addonOptions?.length) {
    return offering.addonOptions
      .map((choice) => `${choice.label}: ${formatDuration(choice.minutes)}`)
      .join(' · ');
  }
  if (offering.bookingMode === 'enquiry') return offerDurationLabel(editorialDuration);
  const parts = offering.variants.flatMap((variant) => {
    if (variant.durationMinutes == null) return [];
    const duration = formatDuration(variant.durationMinutes);
    return [variant.label ? `${variant.label}: ${duration}` : duration];
  });
  return parts.length ? parts.join(' · ') : OFFER_DURATION_FALLBACK;
}
