import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { formatPrice } from '@/lib/booking/format';
import { DEFAULT_OFFERS } from './defaults';
import {
  resolveOffering,
  settingsFromRows,
  type OfferingServiceInfo,
  type OfferingSettings,
} from './offering';
import {
  offeringDurationLabel,
  offeringPriceLabel,
  offeringPriceText,
  variantPriceLabel,
} from './offering-labels';

/**
 * The Kostprijs and Duur lines of an offering, with the three-variant fits of
 * 27 Oct 2026 (Jeugd – eenmalig, Jeugd – volledig pakket) and the free-text
 * Kostprijs of an offering that is asked for.
 */

const SERVICES: OfferingServiceInfo[] = DEFAULT_SERVICES.map((service) => ({
  id: `svc-${service.slug}`,
  slug: service.slug,
  name: service.name,
  choiceLabel: service.choiceLabel,
  durationMinutes: service.durationMinutes,
  isActive: true,
  requiresGuardian: service.requiresGuardian,
  priceCents: null,
  showPrice: false,
}));
const ALL_OFFERED = new Set(SERVICES.map((service) => service.id));

/** The settings of a default offering, as the store would read them. */
function settingsOf(slug: string): OfferingSettings {
  const entry = DEFAULT_OFFERS.find((offer) => offer.content.slug === slug);
  if (!entry) throw new Error(slug);
  return {
    isListed: entry.isListed,
    bookingMode: entry.bookingMode,
    variantMode: entry.variantMode,
    variants: entry.variants.map((variant) => ({
      audience: variant.audience,
      serviceId: variant.serviceSlug ? `svc-${variant.serviceSlug}` : null,
      priceCents: variant.priceCents,
    })),
    isAddon: entry.isAddon,
    soldAlone: entry.soldAlone,
    addonMinutes: entry.addonMinutes,
    addonIds: [],
    addonOptions: entry.addonOptions,
  };
}

const resolved = (settings: OfferingSettings) =>
  resolveOffering({
    settings,
    source: 'stored',
    services: SERVICES,
    bookableServiceIds: ALL_OFFERED,
  });

const THREE_PRICES = [
  `Volwassene ${formatPrice(27500)}`,
  `Jeugd – eenmalig ${formatPrice(15000)}`,
  `Jeugd – volledig pakket ${formatPrice(27500)}`,
].join(' · ');

describe('the fits name their three variants (27 Oct 2026)', () => {
  it('Bikefit – huidige fiets: Kostprijs and Duur list Volwassene, Jeugd – eenmalig and Jeugd – volledig pakket', () => {
    const fit = resolved(settingsOf('bikefit-huidige-fiets'));
    expect(fit.status).toBe('bookable');
    expect(offeringPriceLabel(fit)).toBe(THREE_PRICES);
    expect(offeringDurationLabel(fit, '')).toBe(
      'Volwassene: 2 uur · Jeugd – eenmalig: 2 uur · Jeugd – volledig pakket: 2 uur',
    );
  });

  it('Bikefit – aankoop nieuwe fiets (asked for): the same prices, its own duration text', () => {
    const fit = resolved(settingsOf('bikefit-nieuwe-fiets'));
    expect(fit.status).toBe('enquiry');
    expect(offeringPriceLabel(fit)).toBe(THREE_PRICES);
    expect(offeringDurationLabel(fit, '2 uur')).toBe('2 uur');
  });

  it('older data without the third row reads it as a variant without service and price', () => {
    const older = settingsFromRows(
      { isListed: true, bookingMode: 'direct', variantMode: 'audience' },
      [
        { audience: 'adult', serviceId: 'svc-volwassenenfit', priceCents: 27500 },
        { audience: 'youth', serviceId: 'svc-jeugdfit', priceCents: 15000 },
      ],
    );
    const fit = resolved(older);
    expect(fit.variants[2]).toMatchObject({
      audience: 'youth-package',
      label: 'Jeugd – volledig pakket',
      serviceId: null,
      serviceSlug: null,
      durationMinutes: null,
      priceCents: null,
      bookable: false,
    });
    expect(fit.status).toBe('bookable');
    expect(offeringPriceLabel(fit)).toBe(
      `Volwassene ${formatPrice(27500)} · Jeugd – eenmalig ${formatPrice(15000)} · Jeugd – volledig pakket op aanvraag`,
    );
    expect(offeringDurationLabel(fit, '')).toBe('Volwassene: 2 uur · Jeugd – eenmalig: 2 uur');
  });

  it('one variant: its amount, or "Prijs op aanvraag"', () => {
    expect(variantPriceLabel({ priceCents: 7500 })).toBe(formatPrice(7500));
    expect(variantPriceLabel({ priceCents: null })).toBe('Prijs op aanvraag');
  });
});

describe('a free-text Kostprijs (27 Oct 2026)', () => {
  const text = 'Gratis binnen 6 maanden na je fit, daarna € 75';
  const secondVisit = resolved(settingsOf('bikefit-tweede-bezoek'));

  it('replaces the price of an offering that is asked for; the variant keeps its cents', () => {
    expect(secondVisit.bookingMode).toBe('enquiry');
    expect(offeringPriceLabel(secondVisit)).toBe(formatPrice(7500));
    expect(offeringPriceLabel(secondVisit, text)).toBe(text);
    expect(offeringPriceLabel(secondVisit, `  ${text}\n`)).toBe(text);
    expect(offeringPriceText(secondVisit, text)).toBe(text);
    expect(secondVisit.variants[0].priceCents).toBe(7500);
  });

  it('is nothing when empty or blank: the prices of the variants', () => {
    for (const empty of ['', '   ', '\n', undefined, null]) {
      expect(offeringPriceText(secondVisit, empty)).toBe('');
    }
    expect(offeringPriceLabel(secondVisit, '   ')).toBe(formatPrice(7500));
  });

  it('is ignored for an offering booked online: its services carry the prices', () => {
    const fit = resolved(settingsOf('bikefit-huidige-fiets'));
    expect(offeringPriceText(fit, text)).toBe('');
    expect(offeringPriceLabel(fit, text)).toBe(THREE_PRICES);
  });

  it('beats the choices of an extra that is asked for', () => {
    const secondBike = resolved(settingsOf('bikefit-tweede-fiets'));
    expect(offeringPriceLabel(secondBike)).toBe(
      `Zelfde type fiets ${formatPrice(7500)} · Ander type fiets ${formatPrice(15000)}`,
    );
    expect(offeringPriceLabel(secondBike, 'Vanaf € 75')).toBe('Vanaf € 75');
  });

  it('is part of the default of Bikefit – tweede bezoek only', () => {
    const withText = DEFAULT_OFFERS.filter((entry) => entry.content.priceText !== '');
    expect(withText.map((entry) => entry.content.slug)).toEqual(['bikefit-tweede-bezoek']);
    // The default says the same as `text`, with the window and the price as tokens.
    expect(withText[0].content.priceText).toBe(
      'Gratis binnen {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:bikefit-tweede-bezoek:all}}',
    );
  });
});
