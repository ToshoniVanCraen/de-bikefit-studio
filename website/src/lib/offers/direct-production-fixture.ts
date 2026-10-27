import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import {
  decideProviderRemoval,
  decideYouthPackage,
  type ProviderRow,
  type ServiceRow,
  type SubscriptionRow,
} from '../../../scripts/lib/aanbod-correcties-youth.mjs';
import {
  decideDuration,
  DURATION_TARGETS,
} from '../../../scripts/lib/aanbod-correcties-targets.mjs';
import { type BookableService } from './catalogue';
import { DEFAULT_OFFERINGS, PRICES } from './defaults';
import { buildOfferCatalogue } from './offer-catalogue';
import type { OfferingAudience, OfferingSettings } from './offering';
import type { OfferingRecord } from './offering-content';

/**
 * Production as Toshoni keeps it (27 Oct 2026): "Bikefit – aankoop nieuwe fiets",
 * voetanalyse, zadelanalyse and afstellen-schoenplaatjes booked online (`direct`),
 * where staging only asks for them, so the seeded tests never see this shape.
 * Synthetic data, no real rows: the Beheer-made services of the new-bike fit and
 * of the three analyses carry no price of their own (`repo-variant-services.ts`
 * creates them with `priceCents: null`, `showPrice: false`); two providers, of whom
 * Toshoni loses his offerings. The package service is not typed here: it is what
 * `cms:patch-aanbod-correcties` decides (`decideYouthPackage`), so this file pins
 * the chain patch → catalogue → what `/aanbod`, the offer pages and the booking
 * widget's choices get. The widget's own rendering: `booking/direct-booking-widget.test.ts`.
 */

/** Intl puts a no-break space between the euro sign and the amount. */
const plain = (value: string) => value.replace(/\s/g, ' ');
const offeringId = (slug: string) => `off-${slug}`;
const serviceId = (slug: string) => `svc-${slug}`;

const TOSHONI: ProviderRow = {
  id: 'prov-1',
  displayName: 'Toshoni',
  isActive: true,
  userActive: true,
  userEmail: 'eigenaar@studio.invalid',
};
const FITTER: ProviderRow = {
  id: 'prov-2',
  displayName: 'Fitter Twee',
  isActive: true,
  userActive: true,
  userEmail: 'fitter@studio.invalid',
};
const PROVIDERS = [TOSHONI, FITTER];

const defaultOffering = (slug: string) => {
  const entry = DEFAULT_OFFERINGS.find((offering) => offering.content.slug === slug);
  if (!entry) throw new Error(`no default offering ${slug}`);
  return entry;
};
const NEW_BIKE = defaultOffering('bikefit-nieuwe-fiets');

/** A `cms_services` row; the defaults are those of a service Beheer → Aanbod made. */
function serviceRow(
  slug: string,
  facts: Partial<ServiceRow> & Pick<ServiceRow, 'name' | 'durationMinutes' | 'sortOrder'>,
): ServiceRow {
  return {
    id: serviceId(slug),
    slug,
    isActive: true,
    choiceLabel: '',
    description: '',
    bufferAfterMinutes: 15,
    priceCents: null,
    showPrice: false,
    locationId: null,
    requiresGuardian: false,
    ...facts,
  };
}

// Beheer-made: "<title> – <label>", sort order category × 10 000 + offering order × 3 + audience rank.
const NB_ADULT = serviceRow('bikefit-nieuwe-fiets-volwassene', {
  name: 'Bikefit – aankoop nieuwe fiets – Volwassene',
  choiceLabel: 'Volwassene',
  description: NEW_BIKE.content.summary,
  durationMinutes: 60,
  sortOrder: 30,
});
const NB_YOUTH = serviceRow('bikefit-nieuwe-fiets-jeugd', {
  name: 'Bikefit – aankoop nieuwe fiets – Jeugd',
  choiceLabel: 'Jeugd',
  description: NEW_BIKE.content.summary,
  durationMinutes: 60,
  requiresGuardian: true,
  sortOrder: 31,
});
// The current-bike fit: the bootstrap services, saved once through the repo (sort order 60–62).
const FITS = DEFAULT_SERVICES.map((service, index) =>
  serviceRow(service.slug, {
    name: service.name,
    choiceLabel: service.choiceLabel,
    description: service.description,
    durationMinutes: service.durationMinutes,
    priceCents: service.priceCents,
    showPrice: service.showPrice,
    requiresGuardian: service.requiresGuardian,
    sortOrder: 60 + index,
  }),
);
const FOOT = serviceRow('voetanalyse', { name: 'Voetanalyse', durationMinutes: 60, sortOrder: 90 });
const SADDLE = serviceRow('zadelanalyse', {
  name: 'Zadelanalyse',
  durationMinutes: 60,
  sortOrder: 120,
});
const CLEATS = serviceRow('afstellen-schoenplaatjes', {
  name: 'Afstellen schoenplaatjes',
  durationMinutes: 60,
  sortOrder: 150,
});

const BEFORE_SERVICES = [NB_ADULT, NB_YOUTH, ...FITS, FOOT, SADDLE, CLEATS];
/** Before the patch both providers offer everything. */
const BEFORE_SUBSCRIPTIONS: SubscriptionRow[] = PROVIDERS.flatMap((provider) =>
  BEFORE_SERVICES.map((service) => ({
    providerId: provider.id,
    serviceId: service.id,
    locationId: null,
  })),
);

// cms:patch-aanbod-correcties on that state (target and youth slug as `defaultInputs()` gives them).
const PACKAGE_DECISION = decideYouthPackage({
  offering: {
    id: offeringId('bikefit-nieuwe-fiets'),
    slug: 'bikefit-nieuwe-fiets',
    title: NEW_BIKE.content.title,
    bookingMode: 'direct',
    variantMode: 'audience',
  },
  variants: [
    {
      offeringId: offeringId('bikefit-nieuwe-fiets'),
      audience: 'adult',
      serviceId: NB_ADULT.id,
      priceCents: PRICES.bikefit,
    },
    {
      offeringId: offeringId('bikefit-nieuwe-fiets'),
      audience: 'youth',
      serviceId: NB_YOUTH.id,
      priceCents: PRICES.bikefitUnder16,
    },
  ],
  services: BEFORE_SERVICES,
  subscriptions: BEFORE_SUBSCRIPTIONS,
  providers: PROVIDERS,
  targetPriceCents: PRICES.bikefitYouthPackage,
  defaultYouthServiceSlug: null,
});
if (PACKAGE_DECISION.service.kind !== 'create') {
  throw new Error('the patch no longer creates the package service of the new-bike fit');
}
const NB_PACKAGE: ServiceRow = {
  ...PACKAGE_DECISION.service.facts,
  id: serviceId(PACKAGE_DECISION.service.facts.slug),
};
const REMOVAL = decideProviderRemoval({
  providers: PROVIDERS,
  subscriptions: BEFORE_SUBSCRIPTIONS,
  services: BEFORE_SERVICES,
  planned: PACKAGE_DECISION.subscribe.map((row) => ({
    providerId: row.providerId,
    serviceId: NB_PACKAGE.id,
  })),
});

// The duration section of the patch updates only time; it does not rename the
// Beheer-made adult/youth services. The audience label on the public offer
// comes from the variant, not from the service's persisted choiceLabel.
const durationTarget = (offeringSlug: string) => {
  const target = DURATION_TARGETS.find((entry) => entry.slug === offeringSlug);
  if (!target) throw new Error(`no duration target for ${offeringSlug}`);
  return target.minutes;
};
const AFTER_MINUTES: Record<string, number> = {
  'bikefit-nieuwe-fiets-volwassene': durationTarget('bikefit-nieuwe-fiets'),
  'bikefit-nieuwe-fiets-jeugd': durationTarget('bikefit-nieuwe-fiets'),
  voetanalyse: durationTarget('voetanalyse'),
  zadelanalyse: durationTarget('zadelanalyse'),
  'afstellen-schoenplaatjes': durationTarget('afstellen-schoenplaatjes'),
};
const SERVICES = [
  ...BEFORE_SERVICES.map((service) => {
    const target = AFTER_MINUTES[service.slug];
    if (target === undefined) return service;
    const decision = decideDuration(service.durationMinutes, target);
    if (decision.action === 'blocked') throw new Error(`duration blocked for ${service.slug}`);
    return { ...service, durationMinutes: target };
  }),
  NB_PACKAGE,
];
const SUBSCRIPTIONS: SubscriptionRow[] = [
  ...BEFORE_SUBSCRIPTIONS.filter((row) => !REMOVAL.rows.includes(row)),
  ...PACKAGE_DECISION.subscribe.map((row) => ({ ...row, serviceId: NB_PACKAGE.id })),
];
/** `listPublicServices()`'s rule: active, offered by an active provider with an active login. */
const BOOKABLE = new Set(
  SUBSCRIPTIONS.filter((row) =>
    PROVIDERS.some((p) => p.id === row.providerId && p.isActive && p.userActive),
  ).map((row) => row.serviceId),
);

function record(slug: string, settings: Partial<OfferingSettings> = {}): OfferingRecord {
  const entry = defaultOffering(slug);
  return {
    id: offeringId(slug),
    locale: 'nl',
    content: entry.content,
    settings: {
      isListed: entry.isListed,
      bookingMode: entry.bookingMode,
      variantMode: entry.variantMode,
      variants: entry.variants.map((variant) => ({
        audience: variant.audience,
        serviceId: variant.serviceSlug ? serviceId(variant.serviceSlug) : null,
        priceCents: variant.priceCents,
      })),
      isAddon: entry.isAddon,
      soldAlone: entry.soldAlone,
      addonMinutes: entry.addonMinutes,
      addonIds: entry.addonSlugs.map(offeringId),
      addonOptions: entry.addonOptions,
      ...settings,
    },
    updatedAt: '2026-10-27T12:00:00.000Z',
  };
}

const variant = (audience: OfferingAudience, service: ServiceRow | null, priceCents: number) => ({
  audience,
  serviceId: service?.id ?? null,
  priceCents,
});
const NEW_BIKE_DIRECT: Partial<OfferingSettings> = {
  bookingMode: 'direct',
  variants: [
    variant('adult', NB_ADULT, PRICES.bikefit),
    variant('youth', NB_YOUTH, PRICES.bikefitUnder16),
    variant('youth-package', NB_PACKAGE, PRICES.bikefitYouthPackage),
  ],
};
const single = (service: ServiceRow, priceCents: number): Partial<OfferingSettings> => ({
  bookingMode: 'direct',
  variantMode: 'single',
  variants: [variant('all', service, priceCents)],
});
const PRODUCTION_SETTINGS: Record<string, Partial<OfferingSettings>> = {
  'bikefit-nieuwe-fiets': NEW_BIKE_DIRECT,
  voetanalyse: single(FOOT, PRICES.foot),
  zadelanalyse: single(SADDLE, PRICES.saddle),
  'afstellen-schoenplaatjes': single(CLEATS, PRICES.cleats),
};
const PRODUCTION = DEFAULT_OFFERINGS.map((entry) =>
  record(entry.content.slug, PRODUCTION_SETTINGS[entry.content.slug]),
);

function build(offerings: OfferingRecord[] = PRODUCTION, services: ServiceRow[] = SERVICES) {
  return buildOfferCatalogue({ offerings, services, bookableServiceIds: BOOKABLE });
}
/** What the booking block hands `/afspraak`: public services, minus the held-back ones, in sort order. */
function servicesOnAfspraak(
  catalogue: ReturnType<typeof build>,
  services: ServiceRow[] = SERVICES,
): BookableService[] {
  const withheld = new Set(catalogue.withheldServiceIds);
  return services
    .filter((service) => BOOKABLE.has(service.id) && !withheld.has(service.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, slug }) => ({ id, slug }));
}
const card = (catalogue: ReturnType<typeof build>, slug: string) => {
  const found = catalogue.offers.find((offer) => offer.slug === slug);
  if (!found) throw new Error(`no card ${slug}`);
  return found;
};
const offerOf = (slug: string) => ({
  slug,
  title: defaultOffering(slug).content.title,
  path: `/aanbod/${slug}`,
});
const NB_IDS = [NB_ADULT.id, NB_YOUTH.id, NB_PACKAGE.id];
const FIT_IDS = FITS.map((service) => service.id);

export {
  plain,
  TOSHONI,
  FITTER,
  PROVIDERS,
  NB_ADULT,
  NB_YOUTH,
  FITS,
  FOOT,
  SADDLE,
  CLEATS,
  BEFORE_SERVICES,
  BEFORE_SUBSCRIPTIONS,
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
};
