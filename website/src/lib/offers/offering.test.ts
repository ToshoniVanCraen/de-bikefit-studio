import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { formatPrice } from '@/lib/booking/format';
import {
  OFFERING_STATUS_LABELS,
  offeringBookingSlugs,
  offeringDurationLabel,
  offeringPriceLabel,
  resolveOffering,
  settingsFromRows,
  validateOfferingInput,
  withheldServiceIds,
  type OfferingInput,
  type OfferingServiceInfo,
  type OfferingSettings,
} from './offering';

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

/** The two bootstrap services plus the three retired ones, as the offering code sees them. */
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

const FACTS = {
  durationMinutes: 90,
  bufferAfterMinutes: null,
  locationId: null,
  requiresGuardian: false,
};

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

describe('validateOfferingInput (Beheer → Aanbod)', () => {
  it('accepts Volwassene/Jeugd booked directly, each its own service facts and price', () => {
    const youthFacts = { ...FACTS, durationMinutes: 60, requiresGuardian: true };
    const result = validateOfferingInput({
      ...audienceDirect,
      variants: [
        { audience: 'adult', serviceId: ADULT, priceCents: 15000, service: FACTS },
        { audience: 'youth', serviceId: YOUTH, priceCents: null, service: youthFacts },
      ],
    });
    expect(result).toEqual({
      ok: true,
      data: {
        settings: {
          ...audienceDirect,
          variants: [
            { audience: 'adult', serviceId: ADULT, priceCents: 15000 },
            { audience: 'youth', serviceId: YOUTH, priceCents: null },
          ],
        },
        services: { adult: FACTS, youth: youthFacts },
      },
    });
  });

  it('direct booking needs the service facts (a duration) for every variant', () => {
    const result = validateOfferingInput({
      ...audienceDirect,
      variants: [
        { audience: 'adult', serviceId: ADULT, priceCents: null, service: FACTS },
        { audience: 'youth', serviceId: null, priceCents: null, service: null },
      ],
    });
    expect(result).toEqual({
      ok: false,
      message: 'Vul voor Jeugd – eenmalig de duur in om het online te boeken.',
    });
    expect(
      validateOfferingInput({
        ...audienceDirect,
        variants: [
          {
            audience: 'adult',
            serviceId: ADULT,
            priceCents: null,
            service: { ...FACTS, durationMinutes: 3 },
          },
          { audience: 'youth', serviceId: YOUTH, priceCents: null, service: FACTS },
        ],
      }),
    ).toMatchObject({ ok: false, message: expect.stringContaining('minstens 5 minuten') });
  });

  it('an enquiry needs no service', () => {
    const result = validateOfferingInput({
      isListed: true,
      isAddon: false,
      soldAlone: true,
      addonMinutes: null,
      addonIds: [],
      addonOptions: [],
      bookingMode: 'enquiry',
      variantMode: 'single',
      variants: [{ audience: 'all', serviceId: null, priceCents: 9900 }],
    });
    expect(result).toMatchObject({ ok: true, data: { services: { all: null } } });
  });

  it('refuses one service for both audiences, variants that do not match the mode, € 0 and junk', () => {
    expect(
      validateOfferingInput({
        ...audienceDirect,
        variants: [
          { audience: 'adult', serviceId: ADULT, priceCents: null, service: FACTS },
          { audience: 'youth', serviceId: ADULT, priceCents: null, service: FACTS },
        ],
      }),
    ).toMatchObject({ ok: false, message: expect.stringContaining('eigen dienst') });
    expect(validateOfferingInput({ ...audienceDirect, variantMode: 'single' })).toMatchObject({
      ok: false,
      message: 'De varianten passen niet bij de gekozen opdeling.',
    });
    expect(
      validateOfferingInput({
        isListed: true,
        isAddon: false,
        soldAlone: true,
        addonMinutes: null,
        addonIds: [],
        addonOptions: [],
        bookingMode: 'enquiry',
        variantMode: 'single',
        variants: [{ audience: 'all', serviceId: null, priceCents: 0 }],
      }),
    ).toMatchObject({ ok: false, message: expect.stringContaining('€ 0') });
    expect(validateOfferingInput({ ...audienceDirect, bookingMode: 'maybe' }).ok).toBe(false);
    expect(validateOfferingInput(null).ok).toBe(false);
  });
});

describe('settingsFromRows (stored rows, read defensively)', () => {
  it('orders variants by the mode and fills a missing one with nothing', () => {
    expect(
      settingsFromRows({ isListed: false, bookingMode: 'direct', variantMode: 'audience' }, [
        { audience: 'youth', serviceId: YOUTH, priceCents: 9500 },
      ]),
    ).toEqual({
      isListed: false,
      isAddon: false,
      soldAlone: true,
      addonMinutes: null,
      addonIds: [],
      addonOptions: [],
      bookingMode: 'direct',
      variantMode: 'audience',
      variants: [
        { audience: 'adult', serviceId: null, priceCents: null },
        { audience: 'youth', serviceId: YOUTH, priceCents: 9500 },
        { audience: 'youth-package', serviceId: null, priceCents: null },
      ],
    });
  });

  it('reads unknown modes as the safe default and drops a non-positive price', () => {
    expect(
      settingsFromRows({ isListed: true, bookingMode: '??', variantMode: '??' }, [
        { audience: 'all', serviceId: ADULT, priceCents: 0 },
        { audience: 'adult', serviceId: YOUTH, priceCents: 100 },
      ]),
    ).toEqual({
      isListed: true,
      isAddon: false,
      soldAlone: true,
      addonMinutes: null,
      addonIds: [],
      addonOptions: [],
      bookingMode: 'enquiry',
      variantMode: 'single',
      variants: [{ audience: 'all', serviceId: ADULT, priceCents: null }],
    });
  });
});

describe('resolveOffering and its labels', () => {
  const bothOffered = new Set([ADULT, YOUTH]);

  it('bookable while ≥ 1 variant has an active provider; durations from the services', () => {
    const resolved = resolveOffering({
      settings: audienceDirect,
      source: 'stored',
      services: SERVICES,
      bookableServiceIds: bothOffered,
    });
    expect(resolved.status).toBe('bookable');
    expect(offeringDurationLabel(resolved, 'Duur in overleg')).toBe(
      'Volwassene: 2 uur · Jeugd – eenmalig: 2 uur',
    );
    expect(offeringPriceLabel(resolved)).toBe('Prijs op aanvraag');
    expect(offeringBookingSlugs(resolved)).toEqual(['volwassenenfit', 'jeugdfit']);
  });

  it('unavailable (temporarily) when nobody offers any variant: no slugs, durations still shown', () => {
    const resolved = resolveOffering({
      settings: audienceDirect,
      source: 'stored',
      services: SERVICES,
      bookableServiceIds: new Set(),
    });
    expect(resolved.status).toBe('unavailable');
    expect(offeringBookingSlugs(resolved)).toEqual([]);
    expect(offeringDurationLabel(resolved, '')).toBe('Volwassene: 2 uur · Jeugd – eenmalig: 2 uur');
  });

  it('a variant without a provider is left out of the booking, the other stays bookable', () => {
    const resolved = resolveOffering({
      settings: audienceDirect,
      source: 'stored',
      services: SERVICES,
      bookableServiceIds: new Set([ADULT]),
    });
    expect(resolved.status).toBe('bookable');
    expect(resolved.variants.map((variant) => variant.bookable)).toEqual([true, false]);
    expect(offeringBookingSlugs(resolved)).toEqual(['volwassenenfit']);
  });

  it('an inactive service is never bookable and has no duration', () => {
    const resolved = resolveOffering({
      settings: audienceDirect,
      source: 'stored',
      services: SERVICES.map((service) =>
        service.id === YOUTH ? { ...service, isActive: false } : service,
      ),
      bookableServiceIds: bothOffered,
    });
    expect(resolved.variants[1]).toMatchObject({ bookable: false, durationMinutes: null });
    expect(offeringDurationLabel(resolved, '')).toBe('Volwassene: 2 uur');
  });

  it('enquiry: never bookable, editorial duration, own price; hidden: no slugs', () => {
    const enquiry = resolveOffering({
      settings: {
        isListed: true,
        isAddon: false,
        soldAlone: true,
        addonMinutes: null,
        addonIds: [],
        addonOptions: [],
        bookingMode: 'enquiry',
        variantMode: 'single',
        variants: [{ audience: 'all', serviceId: ADULT, priceCents: 12000 }],
      },
      source: 'stored',
      services: SERVICES,
      bookableServiceIds: bothOffered,
    });
    expect(enquiry.status).toBe('enquiry');
    expect(enquiry.variants[0].bookable).toBe(false);
    expect(offeringDurationLabel(enquiry, 'Ongeveer 2 uur')).toBe('Ongeveer 2 uur');
    expect(offeringDurationLabel(enquiry, ' ')).toBe('Duur in overleg');
    expect(offeringPriceLabel(enquiry)).toBe(formatPrice(12000));

    const hidden = resolveOffering({
      settings: { ...audienceDirect, isListed: false },
      source: 'stored',
      services: SERVICES,
      bookableServiceIds: bothOffered,
    });
    expect(hidden.status).toBe('bookable');
    expect(offeringBookingSlugs(hidden)).toEqual([]);
  });

  it('prices per variant, never invented', () => {
    const resolved = resolveOffering({
      settings: {
        ...audienceDirect,
        variants: [
          { audience: 'adult', serviceId: ADULT, priceCents: 15000 },
          { audience: 'youth', serviceId: YOUTH, priceCents: null },
        ],
      },
      source: 'stored',
      services: SERVICES,
      bookableServiceIds: bothOffered,
    });
    expect(offeringPriceLabel(resolved)).toBe(
      `Volwassene ${formatPrice(15000)} · Jeugd – eenmalig op aanvraag`,
    );
  });
});

describe('withheldServiceIds (a variant is booked through its offering only)', () => {
  const enquiryWithService: OfferingSettings = {
    isListed: true,
    isAddon: false,
    soldAlone: true,
    addonMinutes: null,
    addonIds: [],
    addonOptions: [],
    bookingMode: 'enquiry',
    variantMode: 'single',
    variants: [{ audience: 'all', serviceId: 'svc-gezinspakket', priceCents: null }],
  };

  it('holds back the services of hidden, enquiry and invisible offerings', () => {
    expect(
      withheldServiceIds([
        { visible: false, settings: audienceDirect },
        { visible: true, settings: enquiryWithService },
      ]),
    ).toEqual(new Set([ADULT, YOUTH, 'svc-gezinspakket']));
  });

  it('a shown, directly booked offering releases its services, even if another holds them', () => {
    expect(
      withheldServiceIds([
        { visible: true, settings: audienceDirect },
        { visible: false, settings: audienceDirect },
      ]),
    ).toEqual(new Set());
  });

  it('services no offering uses are never held back', () => {
    expect(withheldServiceIds([])).toEqual(new Set());
  });
});

describe("extra's (20 Oct 2026)", () => {
  const single = (overrides: Partial<OfferingInput> = {}) =>
    validateOfferingInput({
      isListed: true,
      bookingMode: 'enquiry',
      variantMode: 'single',
      variants: [{ audience: 'all', serviceId: null, priceCents: 8500, service: null }],
      ...overrides,
    });

  it('an extra needs its minutes and a price; an offering not sold alone must be an extra', () => {
    expect(single({ isAddon: true, addonMinutes: 30 }).ok).toBe(true);
    expect(single({ isAddon: true })).toMatchObject({
      ok: false,
      message: expect.stringContaining('minuten'),
    });
    expect(
      single({
        isAddon: true,
        addonMinutes: 30,
        variants: [{ audience: 'all', serviceId: null, priceCents: null, service: null }],
      }),
    ).toMatchObject({ ok: false, message: expect.stringContaining('prijs') });
    expect(single({ soldAlone: false })).toMatchObject({
      ok: false,
      message: expect.stringContaining('extra'),
    });
    expect(single({ addonIds: ['a', 'a'] }).ok).toBe(false);
    const ok = single({ isAddon: true, addonMinutes: 30, soldAlone: false, addonIds: ['a', 'b'] });
    expect(ok.ok && ok.data.settings).toMatchObject({
      isAddon: true,
      soldAlone: false,
      addonMinutes: 30,
      addonIds: ['a', 'b'],
    });
    // Not an extra: the minutes are dropped and it is sold alone.
    const plain = single({ addonMinutes: 45 });
    expect(plain.ok && plain.data.settings).toMatchObject({
      isAddon: false,
      soldAlone: true,
      addonMinutes: null,
    });
  });

  it('rows read defensively; an extra only resolves to the status addon without booking slugs', () => {
    const settings = settingsFromRows(
      {
        isListed: true,
        bookingMode: 'direct',
        variantMode: 'single',
        isAddon: true,
        soldAlone: false,
        addonMinutes: 30,
      },
      [{ audience: 'all', serviceId: ADULT, priceCents: 7500 }],
      ['x', 'x', 'y'],
    );
    expect(settings).toMatchObject({
      isAddon: true,
      soldAlone: false,
      addonMinutes: 30,
      addonIds: ['x', 'y'],
    });
    // Neither an extra nor sold alone would be unreachable: it reads as sold alone, minutes dropped.
    expect(
      settingsFromRows(
        {
          isListed: true,
          bookingMode: 'enquiry',
          variantMode: 'single',
          isAddon: false,
          soldAlone: false,
          addonMinutes: 30,
        },
        [],
      ),
    ).toMatchObject({ isAddon: false, soldAlone: true, addonMinutes: null, addonIds: [] });
    const resolved = resolveOffering({
      settings,
      source: 'stored',
      services: SERVICES,
      bookableServiceIds: new Set([ADULT]),
    });
    expect(resolved.status).toBe('addon');
    expect(resolved.soldAlone).toBe(false);
    expect(offeringBookingSlugs(resolved)).toEqual([]);
    expect(OFFERING_STATUS_LABELS.addon).toBe('Enkel als extra bij een afspraak');
    // An extra only is held back from /afspraak even while direct and offered.
    expect(withheldServiceIds([{ visible: true, settings }])).toEqual(new Set([ADULT]));
  });
});
