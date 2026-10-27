import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { DEFAULT_OFFERS } from './defaults';
import type { OfferingServiceInfo, OfferingSettings } from './offering';
import { deriveLegacyOffering, legacyFieldsOf } from './offering-legacy';

/**
 * The settings an offer page had before Beheer → Aanbod (`cms:migrate-aanbod`
 * still derives them from a legacy `offer` block). Moved out of
 * `offering.test.ts` on 27 Oct 2026: the module has its own test, and that file
 * was past the size limit.
 */

/**
 * The three services retired on 17 Oct 2026, as a database that still has
 * them (active, no offering) looks: a fixture here, no longer a default.
 */
const RETIRED_SERVICES = [
  {
    slug: 'gezinspakket',
    name: 'Gezinspakket',
    choiceLabel: '',
    durationMinutes: 150,
    requiresGuardian: false,
  },
  {
    slug: 'fit-aan-huis',
    name: 'Fit aan huis',
    choiceLabel: '',
    durationMinutes: 120,
    requiresGuardian: false,
  },
  {
    slug: 'inspanningstest',
    name: 'Inspanningstest',
    choiceLabel: '',
    durationMinutes: 60,
    requiresGuardian: false,
  },
];

/** The bootstrap services plus the three retired ones, as the offering code sees them. */
const SERVICES: OfferingServiceInfo[] = [...DEFAULT_SERVICES, ...RETIRED_SERVICES].map(
  (service) => ({
    id: `svc-${service.slug}`,
    slug: service.slug,
    name: service.name,
    choiceLabel: service.choiceLabel,
    durationMinutes: service.durationMinutes,
    isActive: true,
    requiresGuardian: service.requiresGuardian,
    priceCents: null,
    showPrice: false,
  }),
);

const ADULT = 'svc-volwassenenfit';
const YOUTH = 'svc-jeugdfit';

/**
 * The legacy `offer` block of a seeded offer page (before 17 Oct 2026). Such a
 * page never linked "Jeugdfit – volledig pakket" (27 Oct 2026).
 */
function seeded(slug: string) {
  const offer = DEFAULT_OFFERS.find((entry) => entry.content.slug === slug);
  if (!offer) throw new Error(slug);
  return legacyFieldsOf({
    bookingServiceSlugs: offer.variants
      .map((variant) => variant.serviceSlug)
      .filter((linked) => linked && linked !== 'jeugdfit-pakket'),
    priceCents: null,
    priceLabel: 'Prijs op aanvraag',
  });
}

/** What a legacy page with both fits becomes: the old Volwassene + Jeugd pair, no price. */
const audienceDirect: OfferingSettings = {
  isListed: true,
  isAddon: false,
  soldAlone: true,
  addonMinutes: null,
  addonIds: [],
  addonOptions: [],
  bookingMode: 'direct',
  variantMode: 'audience',
  variants: [
    { audience: 'adult', serviceId: ADULT, priceCents: null },
    { audience: 'youth', serviceId: YOUTH, priceCents: null },
  ],
};

describe('deriveLegacyOffering (the settings an offer page had before Beheer → Aanbod)', () => {
  it('Bikefit – huidige fiets: booked directly, Volwassene = Volwassenenfit, Jeugd = Jeugdfit, no price', () => {
    expect(deriveLegacyOffering(seeded('bikefit-huidige-fiets'), SERVICES)).toEqual({
      settings: audienceDirect,
      exact: true,
      notes: [],
    });
  });

  it('every other seeded offer is asked for, one option, "Prijs op aanvraag", exactly', () => {
    for (const offer of DEFAULT_OFFERS.filter((entry) => entry.bookingMode === 'enquiry')) {
      expect(
        deriveLegacyOffering(seeded(offer.content.slug), SERVICES),
        offer.content.slug,
      ).toEqual({
        settings: {
          isListed: true,
          isAddon: false,
          soldAlone: true,
          addonMinutes: null,
          addonIds: [],
          addonOptions: [],
          bookingMode: 'enquiry',
          variantMode: 'single',
          variants: [{ audience: 'all', serviceId: null, priceCents: null }],
        },
        exact: true,
        notes: [],
      });
    }
  });

  it('keeps an editorial amount of an unlinked offer, never a free-text label', () => {
    expect(
      deriveLegacyOffering({ bookingServiceSlugs: [], priceCents: 9900, priceLabel: '' }, SERVICES)
        .settings.variants,
    ).toEqual([{ audience: 'all', serviceId: null, priceCents: 9900 }]);
    const label = deriveLegacyOffering(
      { bookingServiceSlugs: [], priceCents: 9900, priceLabel: 'vanaf € 120' },
      SERVICES,
    );
    expect(label.exact).toBe(false);
    expect(label.settings.variants[0].priceCents).toBeNull();
    expect(label.notes[0]).toContain('vanaf € 120');
  });

  it('never copies a service price onto the offer, and says so', () => {
    const priced = SERVICES.map((service) =>
      service.id === ADULT ? { ...service, priceCents: 15000, showPrice: true } : service,
    );
    const result = deriveLegacyOffering(seeded('bikefit-huidige-fiets'), priced);
    expect(result.settings.variants.every((variant) => variant.priceCents === null)).toBe(true);
    expect(result.exact).toBe(false);
    expect(result.notes[0]).toContain('Volwassenenfit');
  });

  it('one linked service is one option; unknown or unsplittable links are not exact', () => {
    expect(
      deriveLegacyOffering(
        { bookingServiceSlugs: ['gezinspakket'], priceCents: null, priceLabel: '' },
        SERVICES,
      ),
    ).toMatchObject({
      exact: true,
      settings: {
        bookingMode: 'direct',
        variantMode: 'single',
        variants: [{ audience: 'all', serviceId: 'svc-gezinspakket' }],
      },
    });
    const unknown = deriveLegacyOffering(
      { bookingServiceSlugs: ['bestaat-niet'], priceCents: null, priceLabel: '' },
      SERVICES,
    );
    expect(unknown).toMatchObject({ exact: false, settings: { bookingMode: 'enquiry' } });
    const two = deriveLegacyOffering(
      { bookingServiceSlugs: ['gezinspakket', 'fit-aan-huis'], priceCents: null, priceLabel: '' },
      SERVICES,
    );
    expect(two).toMatchObject({ exact: false, settings: { variantMode: 'single' } });
  });
});
