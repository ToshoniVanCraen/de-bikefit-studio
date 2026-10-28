import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { formatDuration, formatPrice } from '@/lib/booking/format';
import { defaultSiteSettings } from '@/lib/cms/site-settings';
import { buildCopyTokenLookup } from '@/lib/studio/copy-token-values';
import { resolveCopyTokensInText } from '@/lib/studio/copy-tokens';
import { groupBookingChoices, offerBookingHref, resolveBookingSelection } from './catalogue';
import { PRICES } from './defaults';
import {
  plain,
  TOSHONI,
  FITTER,
  NB_ADULT,
  NB_YOUTH,
  FOOT,
  SADDLE,
  CLEATS,
  PACKAGE_DECISION,
  NB_PACKAGE,
  REMOVAL,
  AFTER_MINUTES,
  SERVICES,
  SUBSCRIPTIONS,
  BOOKABLE,
  NEW_BIKE_DIRECT,
  PRODUCTION,
  build,
  servicesOnAfspraak,
  card,
  offerOf,
  NB_IDS,
  FIT_IDS,
  record,
  variant,
} from './direct-production-fixture';

describe('cms:patch-aanbod-correcties on production (synthetic): the package of the new-bike fit', () => {
  it('starts from the reported Beheer production rows, then changes only targeted durations', () => {
    expect(
      [NB_ADULT, NB_YOUTH, FOOT, SADDLE, CLEATS].map((s) => [s.slug, s.durationMinutes]),
    ).toEqual([
      ['bikefit-nieuwe-fiets-volwassene', 60],
      ['bikefit-nieuwe-fiets-jeugd', 60],
      ['voetanalyse', 60],
      ['zadelanalyse', 60],
      ['afstellen-schoenplaatjes', 60],
    ]);
    expect(
      SERVICES.filter((s) => s.slug in AFTER_MINUTES).map((s) => [s.slug, s.durationMinutes]),
    ).toEqual([
      ['bikefit-nieuwe-fiets-volwassene', 120],
      ['bikefit-nieuwe-fiets-jeugd', 120],
      ['voetanalyse', 30],
      ['zadelanalyse', 60],
      ['afstellen-schoenplaatjes', 15],
    ]);
    expect(SERVICES.find((s) => s.id === NB_YOUTH.id)).toMatchObject({
      name: 'Bikefit – aankoop nieuwe fiets – Jeugd',
      choiceLabel: 'Jeugd',
      requiresGuardian: true,
    });
  });
  it('copies the Beheer-made Jeugd service: € 275 shown, 2 hours, a guardian, offered by the other fitter only', () => {
    expect(PACKAGE_DECISION).toMatchObject({ action: 'update', variant: 'create', blockers: [] });
    expect(NB_PACKAGE).toEqual({
      id: 'svc-bikefit-nieuwe-fiets-jeugd-pakket',
      slug: 'bikefit-nieuwe-fiets-jeugd-pakket',
      name: 'Bikefit – aankoop nieuwe fiets – Jeugd – volledig pakket',
      choiceLabel: 'Jeugd – volledig pakket',
      description: DEFAULT_SERVICES.find((s) => s.slug === 'jeugdfit-pakket')?.description,
      durationMinutes: 120,
      bufferAfterMinutes: NB_YOUTH.bufferAfterMinutes,
      priceCents: 27500,
      showPrice: true,
      locationId: NB_YOUTH.locationId,
      requiresGuardian: true,
      isActive: true,
      sortOrder: NB_YOUTH.sortOrder + 1,
    });
    // Toshoni goes from every offering; each service keeps the other fitter.
    expect(PACKAGE_DECISION.subscribe).toEqual([{ providerId: FITTER.id, locationId: null }]);
    expect(REMOVAL).toMatchObject({ provider: { id: TOSHONI.id }, blockers: [] });
    expect(new Set(SUBSCRIPTIONS.map((row) => row.providerId))).toEqual(new Set([FITTER.id]));
    expect(BOOKABLE).toEqual(new Set(SERVICES.map((service) => service.id)));
    // The two Beheer-made siblings keep no price of their own; only the package shows one.
    expect([NB_ADULT, NB_YOUTH].map((s) => [s.priceCents, s.showPrice])).toEqual([
      [null, false],
      [null, false],
    ]);
  });
});

describe('/aanbod and the offer pages on the production shape', () => {
  it('the new-bike fit is bookable with three variants, priced and timed per variant', () => {
    const offer = card(build(), 'bikefit-nieuwe-fiets');
    expect(offer).toMatchObject({
      status: 'bookable',
      bookingServiceSlugs: NB_IDS.map((id) => id.replace(/^svc-/, '')),
      durationLabel: 'Volwassene: 2 uur · Jeugd – eenmalig: 2 uur · Jeugd – volledig pakket: 2 uur',
    });
    expect(plain(offer.priceLabel)).toBe(
      'Volwassene € 275,00 · Jeugd – eenmalig € 150,00 · Jeugd – volledig pakket € 275,00',
    );
    expect(
      offer.variants.map((v) => [v.label, v.durationMinutes, v.requiresGuardian, v.bookable]),
    ).toEqual([
      ['Volwassene', 120, false, true],
      ['Jeugd – eenmalig', 120, true, true],
      ['Jeugd – volledig pakket', 120, true, true],
    ]);
    expect(offerBookingHref(offer.slug)).toBe('/afspraak?dienst=bikefit-nieuwe-fiets#boeken');
  });

  it('the three analyses are bookable on their own: Duur from their service, Kostprijs from their variant', () => {
    const catalogue = build();
    expect(
      ['voetanalyse', 'zadelanalyse', 'afstellen-schoenplaatjes'].map((slug) => {
        const offer = card(catalogue, slug);
        return [
          offer.status,
          offer.bookingServiceSlugs,
          offer.durationLabel,
          plain(offer.priceLabel),
        ];
      }),
    ).toEqual([
      ['bookable', ['voetanalyse'], '30 min', '€ 85,00'],
      ['bookable', ['zadelanalyse'], '1 uur', '€ 60,00'],
      ['bookable', ['afstellen-schoenplaatjes'], '15 min', '€ 15,00'],
    ]);
  });
});

describe('/afspraak on the production shape: the choices of the widget', () => {
  it('shows the five booking choices in Toshoni’s order, with each audience in order', () => {
    const catalogue = build();
    expect(catalogue.withheldServiceIds).toEqual([]);
    const choices = groupBookingChoices({
      offers: catalogue.offers,
      services: servicesOnAfspraak(catalogue),
    });
    expect(choices).toEqual([
      { kind: 'offer', offer: offerOf('bikefit-nieuwe-fiets'), serviceIds: NB_IDS },
      { kind: 'offer', offer: offerOf('bikefit-huidige-fiets'), serviceIds: FIT_IDS },
      { kind: 'offer', offer: offerOf('afstellen-schoenplaatjes'), serviceIds: [CLEATS.id] },
      { kind: 'offer', offer: offerOf('zadelanalyse'), serviceIds: [SADDLE.id] },
      { kind: 'offer', offer: offerOf('voetanalyse'), serviceIds: [FOOT.id] },
    ]);
  });

  it('keeps audience order whatever the sort order of the services', () => {
    // The package sorted first (e.g. created with a lower number): still the third choice.
    const reordered = SERVICES.map((s) => (s.id === NB_PACKAGE.id ? { ...s, sortOrder: 1 } : s));
    const catalogue = build(PRODUCTION, reordered);
    const [first] = groupBookingChoices({
      offers: catalogue.offers,
      services: servicesOnAfspraak(catalogue, reordered),
    });
    expect(first).toEqual({
      kind: 'offer',
      offer: offerOf('bikefit-nieuwe-fiets'),
      serviceIds: NB_IDS,
    });
  });

  it('labels and prices each choice by its variant: the Beheer-made services show € 275 and € 150, not "Prijs op aanvraag"', () => {
    const { variantDisplay } = build();
    expect([...NB_IDS, FOOT.id, SADDLE.id, CLEATS.id].map((id) => variantDisplay[id])).toEqual([
      { label: 'Volwassene', priceLabel: formatPrice(27500), priceCents: 27500 },
      { label: 'Jeugd – eenmalig', priceLabel: formatPrice(15000), priceCents: 15000 },
      { label: 'Jeugd – volledig pakket', priceLabel: formatPrice(27500), priceCents: 27500 },
      { label: '', priceLabel: formatPrice(8500), priceCents: 8500 },
      { label: '', priceLabel: formatPrice(6000), priceCents: 6000 },
      { label: '', priceLabel: formatPrice(1500), priceCents: 1500 },
    ]);
  });

  it('only an empty variant price reads "op aanvraag": the package service’s own € 275 never stands in', () => {
    const unpriced = PRODUCTION.map((entry) =>
      entry.content.slug === 'bikefit-nieuwe-fiets'
        ? record('bikefit-nieuwe-fiets', {
            ...NEW_BIKE_DIRECT,
            variants: [
              variant('adult', NB_ADULT, PRICES.bikefit),
              variant('youth', NB_YOUTH, PRICES.bikefitUnder16),
              { ...variant('youth-package', NB_PACKAGE, 0), priceCents: null },
            ],
          })
        : entry,
    );
    const catalogue = build(unpriced);
    // '' is what the widget prints as "Prijs op aanvraag" (`serviceMeta`).
    expect(catalogue.variantDisplay[NB_PACKAGE.id]).toEqual({
      label: 'Jeugd – volledig pakket',
      priceLabel: '',
      priceCents: null,
    });
    expect(plain(card(catalogue, 'bikefit-nieuwe-fiets').priceLabel)).toBe(
      'Volwassene € 275,00 · Jeugd – eenmalig € 150,00 · Jeugd – volledig pakket op aanvraag',
    );
  });

  it('?dienst=: the offer narrows to its three services, an analysis is preselected, the package service opens under its offer', () => {
    const catalogue = build();
    const services = servicesOnAfspraak(catalogue);
    const select = (requested: string) =>
      resolveBookingSelection({ requested, offers: catalogue.offers, services });
    expect(select('bikefit-nieuwe-fiets')).toEqual({
      kind: 'offer',
      offer: { ...offerOf('bikefit-nieuwe-fiets'), status: 'bookable' },
      serviceIds: NB_IDS,
      initialServiceId: null,
    });
    expect(select('voetanalyse')).toEqual({
      kind: 'offer',
      offer: { ...offerOf('voetanalyse'), status: 'bookable' },
      serviceIds: [FOOT.id],
      initialServiceId: FOOT.id,
    });
    // A link to the package service itself preselects it, but the widget still shows it
    // under the new-bike fit as "Jeugd – volledig pakket", never as a choice of its own.
    expect(select('bikefit-nieuwe-fiets-jeugd-pakket')).toEqual({
      kind: 'service',
      serviceId: NB_PACKAGE.id,
    });
    const choices = groupBookingChoices({ offers: catalogue.offers, services });
    expect(choices.filter((choice) => choice.kind === 'service')).toEqual([]);
    expect(
      choices.filter((c) => c.kind === 'offer' && c.serviceIds.includes(NB_PACKAGE.id)),
    ).toEqual([{ kind: 'offer', offer: offerOf('bikefit-nieuwe-fiets'), serviceIds: NB_IDS }]);
  });
});

describe('an offering that is asked for never offers the package', () => {
  it('staging: the new-bike fit asked for, its package a variant without a service', () => {
    // What the patch does there (`service: none`): only the third variant row is added.
    const staging = PRODUCTION.map((entry) =>
      entry.content.slug === 'bikefit-nieuwe-fiets' ? record('bikefit-nieuwe-fiets') : entry,
    );
    const catalogue = build(staging);
    expect(card(catalogue, 'bikefit-nieuwe-fiets')).toMatchObject({
      status: 'enquiry',
      bookingServiceSlugs: [],
    });
    expect(
      resolveBookingSelection({
        requested: 'bikefit-nieuwe-fiets',
        offers: catalogue.offers,
        services: servicesOnAfspraak(catalogue),
      }),
    ).toMatchObject({ kind: 'offer', serviceIds: [], offer: { status: 'enquiry' } });
  });

  it('production switched to "op aanvraag" in Beheer: its three services, the package too, are held back', () => {
    const asked = PRODUCTION.map((entry) =>
      entry.content.slug === 'bikefit-nieuwe-fiets'
        ? record('bikefit-nieuwe-fiets', { ...NEW_BIKE_DIRECT, bookingMode: 'enquiry' })
        : entry,
    );
    const catalogue = build(asked);
    expect(new Set(catalogue.withheldServiceIds)).toEqual(new Set(NB_IDS));
    const services = servicesOnAfspraak(catalogue);
    expect(services.map((service) => service.id)).not.toContain(NB_PACKAGE.id);
    expect(NB_IDS.some((id) => id in catalogue.variantDisplay)).toBe(false);
    const select = (requested: string) =>
      resolveBookingSelection({ requested, offers: catalogue.offers, services });
    expect(select('bikefit-nieuwe-fiets')).toMatchObject({ kind: 'offer', serviceIds: [] });
    expect(select('bikefit-nieuwe-fiets-jeugd-pakket')).toEqual({
      kind: 'unknown',
      requested: 'bikefit-nieuwe-fiets-jeugd-pakket',
    });
    // The current-bike fit keeps its own package.
    expect(card(catalogue, 'bikefit-huidige-fiets').bookingServiceSlugs).toContain(
      'jeugdfit-pakket',
    );
  });
});

describe('copy tokens on the production shape', () => {
  const catalogue = build();
  const lookup = buildCopyTokenLookup({
    settings: defaultSiteSettings(),
    // `listPublicServices()` gives each service `formatDuration()` as its duration label.
    services: SERVICES.filter((s) => BOOKABLE.has(s.id)).map((s) => ({
      slug: s.slug,
      durationLabel: formatDuration(s.durationMinutes),
    })),
    offers: Object.values(catalogue.bySlug),
    studioAddress: null,
  });
  const read = (text: string) => plain(resolveCopyTokensInText(text, lookup));

  it('the texts of the new-bike fit read their prices from its variants and the windows from Regels', () => {
    const { content } = catalogue.bySlug['bikefit-nieuwe-fiets'];
    expect(read(content.metaDescription)).toMatch(
      /€ 275; onder 16 € 150 eenmalig of € 275 met een jaar opvolging\.$/,
    );
    expect(content.contents.map(read).join('\n')).not.toContain('{{');
    expect(read('{{prijs:bikefit-nieuwe-fiets}}')).toBe(
      'Volwassene € 275,00 · Jeugd – eenmalig € 150,00 · Jeugd – volledig pakket € 275,00',
    );
    // The package service's description (from the defaults) as it is printed.
    expect(read(NB_PACKAGE.description)).toBe(
      'Voor fietsers onder 16: de volledige fit met een jaar gratis opvolging. Aangeraden: jonge renners groeien snel, en hun fiets groeit niet vanzelf mee.',
    );
  });

  it('{{duur:…}} prints the booked services’ length; {{prijs:…}} the analyses’ variant price', () => {
    expect(
      read(
        '{{duur:volwassenenfit}} | {{duur:bikefit-nieuwe-fiets-jeugd-pakket}} | {{duur:voetanalyse}} | {{duur:zadelanalyse}} | {{duur:afstellen-schoenplaatjes}}',
      ),
    ).toBe('2 uur | 2 uur | 30 min | 1 uur | 15 min');
    expect(
      read('{{prijs:voetanalyse}} / {{prijs:voetanalyse:all}} / {{prijs:zadelanalyse:all}}'),
    ).toBe('€ 85,00 / € 85 / € 60');
  });
});
