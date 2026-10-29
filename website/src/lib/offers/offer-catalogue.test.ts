import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { formatPrice } from '@/lib/booking/format';
import { groupBookingChoices, resolveBookingSelection } from './catalogue';
import { DEFAULT_OFFERINGS, type DefaultOffering } from './defaults';
import { buildOfferCatalogue } from './offer-catalogue';
import type { OfferingServiceInfo, OfferingSettings } from './offering';
import type { OfferingRecord } from './offering-content';

/**
 * The public catalogue as Beheer → Aanbod shapes it: cards, statuses, prices,
 * durations, hidden offerings, and which services `/afspraak` may offer. The
 * offerings are the seeded ones (`defaults.ts`); the services are the two
 * seeded fits plus the three retired services, as an older database has them.
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
const ALL_OFFERED = new Set(SERVICES.map((service) => service.id));
const ADULT = 'svc-volwassenenfit';
const YOUTH = 'svc-jeugdfit';
const HOME = 'svc-fit-aan-huis';

function record(entry: DefaultOffering, settings: Partial<OfferingSettings> = {}): OfferingRecord {
  return {
    id: `off-${entry.content.slug}`,
    locale: 'nl',
    content: entry.content,
    settings: {
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
      // Links by slug → by the ids this fixture gives the offerings.
      addonIds: entry.addonSlugs.map((slug) => `off-${slug}`),
      addonOptions: entry.addonOptions,
      ...settings,
    },
    updatedAt: '2026-10-17T08:00:00.000Z',
  };
}

const SEEDED = DEFAULT_OFFERINGS.map((entry) => record(entry));
const bikefit = (settings: Partial<OfferingSettings> = {}) =>
  record(
    DEFAULT_OFFERINGS.find((entry) => entry.content.slug === 'bikefit-huidige-fiets')!,
    settings,
  );

function build(offerings: OfferingRecord[] = SEEDED, bookable: ReadonlySet<string> = ALL_OFFERED) {
  return buildOfferCatalogue({ offerings, services: SERVICES, bookableServiceIds: bookable });
}

function card(catalogue: ReturnType<typeof build>, slug: string) {
  return catalogue.offers.find((offer) => offer.slug === slug);
}

/** What the offer page prints for the two fits (29 Oct 2026: Jeugd is the one-off fit only). */
const BIKEFIT_PRICE = [
  `Volwassene ${formatPrice(27500)}`,
  `Jeugd – eenmalig ${formatPrice(15000)}`,
].join(' · ');
const BIKEFIT_DURATION = 'Volwassene: 2 uur · Jeugd – eenmalig: 2 uur';

describe('buildOfferCatalogue: the seeded offer', () => {
  it('nine shown offers in category order; Bikefit bookable as Volwassene / Jeugd – eenmalig, the rest on request', () => {
    const catalogue = build();
    expect(catalogue.offers.map((offer) => offer.slug)).toEqual([
      'bikefit-nieuwe-fiets',
      'bikefit-huidige-fiets',
      'bikefit-tweede-bezoek',
      'bikefit-tweede-fiets',
      'voetanalyse',
      'zadelanalyse',
      'afstellen-schoenplaatjes',
      'lactaattest',
      'coaching',
    ]);
    expect(card(catalogue, 'bikefit-huidige-fiets')).toMatchObject({
      status: 'bookable',
      bookingServiceSlugs: ['volwassenenfit', 'jeugdfit'],
      durationLabel: BIKEFIT_DURATION,
      priceLabel: BIKEFIT_PRICE,
    });
    // The fit that is asked for says the same about the youth price.
    expect(card(catalogue, 'bikefit-nieuwe-fiets')?.priceLabel).toBe(BIKEFIT_PRICE);
    // Seven asked for; tweede fiets (20 Oct 2026) is an extra only.
    expect(catalogue.offers.filter((offer) => offer.status === 'enquiry')).toHaveLength(7);
    expect(card(catalogue, 'bikefit-tweede-fiets')?.status).toBe('addon');
    expect(card(catalogue, 'lactaattest')?.durationLabel).toBe('Duur in overleg');
  });

  it('nothing is hidden or held back by default; a service no offering links to is left as it is', () => {
    const catalogue = build();
    expect(catalogue.hiddenSlugs).toEqual([]);
    expect(catalogue.withheldServiceIds).toEqual([]);
    expect(catalogue.bySlug['fit-aan-huis']).toBeUndefined();
  });

  it('the widget shows Bikefit once with its two variants; a lone active service stays its own choice', () => {
    const catalogue = build();
    const withheld = new Set(catalogue.withheldServiceIds);
    const services = SERVICES.filter((service) => !withheld.has(service.id));
    expect(groupBookingChoices({ offers: catalogue.offers, services })).toEqual([
      expect.objectContaining({ kind: 'offer', serviceIds: [ADULT, YOUTH] }),
      { kind: 'service', serviceId: 'svc-gezinspakket' },
      { kind: 'service', serviceId: HOME },
      { kind: 'service', serviceId: 'svc-inspanningstest' },
    ]);
    expect(catalogue.variantDisplay[ADULT]).toEqual({
      label: 'Volwassene',
      priceLabel: formatPrice(27500),
      priceCents: 27500,
    });
    // The widget prints the Jeugd choice, with its own price, as the offer page.
    expect(catalogue.variantDisplay[YOUTH]).toEqual({
      label: 'Jeugd – eenmalig',
      priceLabel: formatPrice(15000),
      priceCents: 15000,
    });
    // Retired for real means deactivated: then it is not among the public services at all.
    const withoutRetired = services.filter((service) => service.id !== HOME);
    expect(
      resolveBookingSelection({
        requested: 'fit-aan-huis',
        offers: catalogue.offers,
        services: withoutRetired,
      }),
    ).toEqual({
      kind: 'unknown',
      requested: 'fit-aan-huis',
    });
  });
});

describe('buildOfferCatalogue: what Beheer → Aanbod controls', () => {
  it('a direct offering nobody offers is temporarily unavailable, never routed elsewhere', () => {
    const catalogue = build(SEEDED, new Set([HOME]));
    expect(card(catalogue, 'bikefit-huidige-fiets')).toMatchObject({
      status: 'unavailable',
      bookingServiceSlugs: [],
      durationLabel: BIKEFIT_DURATION,
    });
    expect(catalogue.withheldServiceIds).not.toContain(ADULT);
  });

  it('a variant nobody offers is left out of the booking; the other stays bookable', () => {
    const catalogue = build(SEEDED, new Set([ADULT]));
    expect(card(catalogue, 'bikefit-huidige-fiets')).toMatchObject({
      status: 'bookable',
      bookingServiceSlugs: ['volwassenenfit'],
    });
  });

  it('a hidden offering leaves every overview, its slug is listed, its services are held back', () => {
    const catalogue = build([
      bikefit({ isListed: false }),
      ...SEEDED.filter((r) => r.content.slug !== 'bikefit-huidige-fiets'),
    ]);
    expect(card(catalogue, 'bikefit-huidige-fiets')).toBeUndefined();
    expect(catalogue.hiddenSlugs).toContain('bikefit-huidige-fiets');
    expect(catalogue.bySlug['bikefit-huidige-fiets']?.content.title).toBe(
      'Bikefit – huidige fiets',
    );
    expect(catalogue.withheldServiceIds).toEqual(expect.arrayContaining([ADULT, YOUTH]));
  });

  it('switching Bikefit to enquiry holds its services back and keeps the editorial duration', () => {
    const catalogue = build([
      bikefit({ bookingMode: 'enquiry' }),
      ...SEEDED.filter((r) => r.content.slug !== 'bikefit-huidige-fiets'),
    ]);
    expect(card(catalogue, 'bikefit-huidige-fiets')).toMatchObject({
      status: 'enquiry',
      bookingServiceSlugs: [],
      durationLabel: 'Duur in overleg',
    });
    expect(catalogue.withheldServiceIds).toEqual(expect.arrayContaining([ADULT, YOUTH]));
  });

  it('prices and labels per variant reach the cards and the widget', () => {
    const priced = bikefit({
      variants: [
        { audience: 'adult', serviceId: ADULT, priceCents: 15000 },
        { audience: 'youth', serviceId: YOUTH, priceCents: null },
      ],
    });
    const catalogue = build([priced]);
    expect(card(catalogue, 'bikefit-huidige-fiets')?.priceLabel).toBe(
      `Volwassene ${formatPrice(15000)} · Jeugd – eenmalig op aanvraag`,
    );
    expect(catalogue.variantDisplay).toEqual({
      [ADULT]: { label: 'Volwassene', priceLabel: formatPrice(15000), priceCents: 15000 },
      [YOUTH]: { label: 'Jeugd – eenmalig', priceLabel: '', priceCents: null },
    });
  });

  it('the free-text Kostprijs of an offering that is asked for reaches its card; a booked one keeps its prices', () => {
    // The card carries the text as stored, tokens and all: the public site resolves them.
    const text =
      'Gratis binnen {{tweede-bezoek-gratis}} na je fit, daarna {{prijs:bikefit-tweede-bezoek:all}}';
    const second = (patch: (record: OfferingRecord) => OfferingRecord) =>
      build(
        SEEDED.map((record) =>
          record.content.slug === 'bikefit-tweede-bezoek' ? patch(record) : record,
        ),
      );
    expect(card(build(), 'bikefit-tweede-bezoek')?.priceLabel).toBe(text);
    // Without the text the variant's € 75 is the price again.
    const cleared = second((record) => ({
      ...record,
      content: { ...record.content, priceText: '' },
    }));
    expect(card(cleared, 'bikefit-tweede-bezoek')?.priceLabel).toBe(formatPrice(7500));
    // Set to be booked online (with nobody offering it), the text no longer applies.
    const direct = second((record) => ({
      ...record,
      settings: { ...record.settings, bookingMode: 'direct' as const },
    }));
    expect(card(direct, 'bikefit-tweede-bezoek')?.priceLabel).toBe(formatPrice(7500));
  });

  it("extra's: the fit offers the two choices of tweede fiets per audience and nothing else; an extra names its hosts; an extra only has no slugs", () => {
    const catalogue = build();
    const line = (option: { slug: string; minutes: number; priceCents: number }) =>
      `${option.slug}:${option.minutes}:${option.priceCents}`;
    // Voetanalyse, zadelanalyse and schoenplaatjes are included in every bikefit: never an extra of one (Toshoni, 27 Oct 2026).
    expect(catalogue.addonsByService[ADULT]?.map(line)).toEqual([
      'bikefit-tweede-fiets:30:7500',
      'bikefit-tweede-fiets:60:15000',
    ]);
    // Tweede fiets is one extra with two choices: one id per choice, grouped under its title.
    expect(catalogue.addonsByService[ADULT]?.map((o) => `${o.optionKey}:${o.label}`)).toEqual([
      'zelfde-type:Zelfde type fiets',
      'ander-type:Ander type fiets',
    ]);
    expect(catalogue.addonsByService[ADULT]?.[0].id).toBe('off-bikefit-tweede-fiets#zelfde-type');
    expect(catalogue.addonsByService[YOUTH]).toHaveLength(2);
    expect(card(catalogue, 'bikefit-tweede-fiets')?.priceLabel).toBe(
      `Zelfde type fiets ${formatPrice(7500)} · Ander type fiets ${formatPrice(15000)}`,
    );
    expect(card(catalogue, 'bikefit-tweede-fiets')?.durationLabel).toBe(
      'Zelfde type fiets: 30 min · Ander type fiets: 1 uur',
    );
    // The enquiry bikefit lists the extras too, but offers nothing through the widget.
    expect(Object.keys(catalogue.addonsByService)).toEqual([ADULT, YOUTH]);
    const tweede = catalogue.bySlug['bikefit-tweede-fiets'];
    expect(tweede.offering.status).toBe('addon');
    expect(tweede.offer.bookingServiceSlugs).toEqual([]);
    expect(tweede.addonHosts.map((host) => `${host.slug}:${host.bookable}`)).toEqual([
      'bikefit-nieuwe-fiets:false',
      'bikefit-huidige-fiets:true',
    ]);
    // The three analyses are asked for, and an extra of no offering.
    for (const slug of ['voetanalyse', 'zadelanalyse', 'afstellen-schoenplaatjes']) {
      expect(catalogue.bySlug[slug].offering).toMatchObject({ status: 'enquiry', isAddon: false });
      expect(catalogue.bySlug[slug].addonHosts).toEqual([]);
    }
    expect(catalogue.bySlug['lactaattest'].addonHosts).toEqual([]);
  });

  it("extra's: an admin may still mark any offering as an extra of the fit (not a default since 27 Oct 2026)", () => {
    // Beheer → Aanbod: voetanalyse marked as an extra (+30 min) and added to the fit's extras.
    const catalogue = build(
      SEEDED.map((record) => {
        if (record.content.slug === 'voetanalyse') {
          return { ...record, settings: { ...record.settings, isAddon: true, addonMinutes: 30 } };
        }
        if (record.content.slug === 'bikefit-huidige-fiets') {
          const addonIds = [...record.settings.addonIds, 'off-voetanalyse'];
          return { ...record, settings: { ...record.settings, addonIds } };
        }
        return record;
      }),
    );
    expect(
      catalogue.addonsByService[ADULT]?.map(
        (option) => `${option.slug}:${option.minutes}:${option.priceCents}`,
      ),
    ).toEqual([
      'bikefit-tweede-fiets:30:7500',
      'bikefit-tweede-fiets:60:15000',
      'voetanalyse:30:8500',
    ]);
    expect(catalogue.bySlug['voetanalyse'].addonHosts.map((host) => host.slug)).toEqual([
      'bikefit-huidige-fiets',
    ]);
  });

  it("extra's: a hidden extra is left out; a host switched to enquiry offers none", () => {
    const hidden = build(
      SEEDED.map((record) =>
        record.content.slug === 'bikefit-tweede-fiets'
          ? { ...record, settings: { ...record.settings, isListed: false } }
          : record,
      ),
    );
    // The second bike is the fit's only extra: hidden, the fit has nothing to offer.
    expect(hidden.addonsByService[ADULT]).toBeUndefined();
    const enquiryHost = build(
      SEEDED.map((record) =>
        record.content.slug === 'bikefit-huidige-fiets'
          ? { ...record, settings: { ...record.settings, bookingMode: 'enquiry' as const } }
          : record,
      ),
    );
    expect(enquiryHost.addonsByService[ADULT]).toBeUndefined();
  });

  it('a single-option enquiry with a price shows it', () => {
    const coaching = SEEDED.find((r) => r.content.slug === 'coaching')!;
    const catalogue = build([
      {
        ...coaching,
        settings: {
          ...coaching.settings,
          variants: [{ audience: 'all', serviceId: null, priceCents: 9900 }],
        },
      },
    ]);
    expect(card(catalogue, 'coaching')?.priceLabel).toBe(formatPrice(9900));
    expect(catalogue.variantDisplay).toEqual({});
  });
});
