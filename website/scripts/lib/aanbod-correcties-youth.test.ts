import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import { formatPriceInProse } from '@/lib/booking/format';
import {
  decideProviderRemoval,
  decideYouthPackage,
  isFirstProvider,
  packageServiceName,
  type ProviderRow,
  type ServiceRow,
  type SubscriptionRow,
  type VariantRow,
} from './aanbod-correcties-youth.mjs';

/**
 * The youth package and the provider Toshoni, the two sections of
 * `cms:patch-aanbod-correcties` that look at who offers what, on plain data:
 * a database in the state of 20 Oct 2026, one that is done, and an admin's own
 * edit.
 */

/** "€ 275": how the change lines write the price of the package. */
const PRICE = formatPriceInProse(27500);

const provider = (
  id: string,
  displayName: string,
  over: Partial<ProviderRow> = {},
): ProviderRow => ({
  id,
  displayName,
  isActive: true,
  userActive: true,
  ...over,
});
const sub = (
  providerId: string,
  serviceId: string,
  locationId: string | null = null,
): SubscriptionRow => ({
  providerId,
  serviceId,
  locationId,
});
const service = (id: string, slug: string, over: Partial<ServiceRow> = {}): ServiceRow => ({
  id,
  slug,
  name: slug,
  isActive: true,
  choiceLabel: '',
  description: '',
  durationMinutes: 120,
  bufferAfterMinutes: 15,
  priceCents: null,
  showPrice: false,
  locationId: null,
  requiresGuardian: false,
  sortOrder: 0,
  ...over,
});

describe('Toshoni as Aanbieder', () => {
  const toshoni = provider('p1', 'Toshoni');
  const other = provider('p2', 'Winston');
  const services = [
    service('s1', 'volwassenenfit'),
    service('s2', 'jeugdfit'),
    service('s3', 'oud', { isActive: false }),
  ];

  it('is found by name, in any case', () => {
    expect(isFirstProvider(' toshoni ')).toBe(true);
    expect(isFirstProvider('TOSHONI')).toBe(true);
    expect(isFirstProvider('Toshoni Van Craen')).toBe(false);
  });

  it('removes all his offerings and names them, while another active provider keeps each service', () => {
    const decision = decideProviderRemoval({
      providers: [toshoni, other],
      subscriptions: [
        sub('p1', 's1'),
        sub('p1', 's2'),
        sub('p1', 's3'),
        sub('p2', 's1'),
        sub('p2', 's2'),
      ],
      services,
      planned: [],
    });
    expect(decision.provider).toBe(toshoni);
    expect(decision.rows.map((row) => row.serviceId)).toEqual(['s1', 's2', 's3']);
    expect(decision.changes).toEqual(['3 offering(s) removed: volwassenenfit, jeugdfit, oud']);
    expect(decision.blockers).toEqual([]);
  });

  it('refuses while an active service would be left without a provider, and says which', () => {
    const decision = decideProviderRemoval({
      providers: [toshoni, other, provider('p3', 'Inactief', { isActive: false })],
      subscriptions: [sub('p1', 's1'), sub('p1', 's2'), sub('p2', 's1'), sub('p3', 's2')],
      services,
      planned: [],
    });
    expect(decision.blockers).toEqual([
      'provider Toshoni: service jeugdfit would be left without a provider — add the other provider to it in Beheer → Aanbieders first',
    ]);
    // What the same run adds counts as another provider.
    const covered = decideProviderRemoval({
      providers: [toshoni, other],
      subscriptions: [sub('p1', 's1'), sub('p1', 's2'), sub('p2', 's1')],
      services,
      planned: [{ providerId: 'p2', serviceId: 's2' }],
    });
    expect(covered.blockers).toEqual([]);
  });

  it('does nothing without such a provider or without offerings, and refuses two of the same name', () => {
    expect(
      decideProviderRemoval({ providers: [other], subscriptions: [], services, planned: [] }),
    ).toEqual({
      provider: null,
      rows: [],
      changes: [],
      blockers: [],
    });
    const none = decideProviderRemoval({
      providers: [toshoni],
      subscriptions: [],
      services,
      planned: [],
    });
    expect(none.rows).toEqual([]);
    expect(none.changes).toEqual([]);
    const twice = decideProviderRemoval({
      providers: [toshoni, provider('p9', 'toshoni')],
      subscriptions: [],
      services,
      planned: [],
    });
    expect(twice.blockers).toEqual([expect.stringContaining('2 providers are named Toshoni')]);
  });
});

describe('the youth package', () => {
  const offering = (slug: string, bookingMode: string, variantMode = 'audience') => ({
    id: `o-${slug}`,
    slug,
    title:
      slug === 'bikefit-huidige-fiets'
        ? 'Bikefit – huidige fiets'
        : 'Bikefit – aankoop nieuwe fiets',
    bookingMode,
    variantMode,
  });
  const variant = (
    offeringId: string,
    audience: string,
    serviceId: string | null,
    priceCents: number | null,
  ): VariantRow => ({
    offeringId,
    audience,
    serviceId,
    priceCents,
  });
  const huidige = offering('bikefit-huidige-fiets', 'direct');
  const providers = [
    provider('p1', 'Toshoni'),
    provider('p2', 'Winston'),
    provider('p3', 'Weg', { isActive: false }),
  ];
  const adult = service('s-adult', 'volwassenenfit', { sortOrder: 60 });
  const youth = service('s-youth', 'jeugdfit', {
    sortOrder: 61,
    locationId: 'l1',
    bufferAfterMinutes: 20,
  });
  const two = [
    variant(huidige.id, 'adult', 's-adult', 27500),
    variant(huidige.id, 'youth', 's-youth', 15000),
  ];
  const subs = [sub('p1', 's-youth'), sub('p2', 's-youth', 'l2'), sub('p3', 's-youth')];
  const base = {
    offering: huidige,
    variants: two,
    services: [adult, youth],
    subscriptions: subs,
    providers,
    targetPriceCents: 27500,
    defaultYouthServiceSlug: 'jeugdfit',
  };

  it('creates jeugdfit-pakket from the defaults for the current-bike fit, next to the youth service', () => {
    const decision = decideYouthPackage(base);
    const defaults = DEFAULT_SERVICES.find((entry) => entry.slug === 'jeugdfit-pakket');
    expect(decision.action).toBe('update');
    expect(decision.variant).toBe('create');
    expect(decision.service).toEqual({
      kind: 'create',
      facts: {
        slug: 'jeugdfit-pakket',
        name: 'Jeugdfit – volledig pakket',
        choiceLabel: 'Jeugd – volledig pakket',
        description: defaults?.description,
        durationMinutes: 120,
        bufferAfterMinutes: 20,
        priceCents: 27500,
        showPrice: true,
        locationId: 'l1',
        requiresGuardian: true,
        isActive: true,
        sortOrder: 62,
      },
    });
    // Whoever offers the youth service, minus Toshoni and the provider that is switched off.
    expect(decision.subscribe).toEqual([{ providerId: 'p2', locationId: 'l2' }]);
    expect(decision.changes).toEqual([
      `Jeugd – volledig pakket: add variant at ${PRICE}`,
      `new service jeugdfit-pakket ("Jeugdfit – volledig pakket", 120 min, ${PRICE})`,
      'offered by 1 provider(s)',
    ]);
  });

  it('adopts a service of that slug that the bootstrap made, and only adds who is missing', () => {
    const bootstrapped = service('s-pack', 'jeugdfit-pakket', {
      priceCents: 27500,
      showPrice: true,
    });
    const decision = decideYouthPackage({ ...base, services: [adult, youth, bootstrapped] });
    expect(decision.service).toEqual({ kind: 'existing', id: 's-pack', slug: 'jeugdfit-pakket' });
    expect(decision.variant).toBe('create');
    expect(decision.subscribe.map((target) => target.providerId)).toEqual(['p2']);
    const subscribed = decideYouthPackage({
      ...base,
      services: [adult, youth, bootstrapped],
      variants: [...two, variant(huidige.id, 'youth-package', 's-pack', 27500)],
      subscriptions: [...subs, sub('p2', 's-pack')],
    });
    expect(subscribed).toMatchObject({
      action: 'none',
      variant: 'exists',
      changes: [],
      subscribe: [],
    });
    const inactive = decideYouthPackage({
      ...base,
      services: [adult, youth, { ...bootstrapped, isActive: false }],
    });
    expect(inactive.action).toBe('blocked');
    expect(inactive.blockers).toEqual([expect.stringContaining('switched off')]);
  });

  it('fills in an empty third row, and refuses another price', () => {
    const filled = decideYouthPackage({
      ...base,
      variants: [...two, variant(huidige.id, 'youth-package', null, null)],
    });
    expect(filled.variant).toBe('fill');
    expect(filled.service.kind).toBe('create');
    const blocked = decideYouthPackage({
      ...base,
      variants: [...two, variant(huidige.id, 'youth-package', 's-youth', 20000)],
    });
    expect(blocked.action).toBe('blocked');
    expect(blocked.blockers).toEqual([expect.stringContaining('20000 cent')]);
  });

  it('adds the row without a service to a fit that is asked for', () => {
    const asked = offering('bikefit-nieuwe-fiets', 'enquiry');
    const decision = decideYouthPackage({
      ...base,
      offering: asked,
      variants: [variant(asked.id, 'adult', null, 27500), variant(asked.id, 'youth', null, 15000)],
      services: [],
      subscriptions: [],
      defaultYouthServiceSlug: null,
    });
    expect(decision).toMatchObject({
      action: 'update',
      variant: 'create',
      service: { kind: 'none' },
      subscribe: [],
      changes: [`Jeugd – volledig pakket: add variant at ${PRICE}`],
    });
  });

  it('copies the youth service of a fit that is booked online under another slug', () => {
    const online = offering('bikefit-nieuwe-fiets', 'direct');
    const own = service('s-own', 'bikefit-aankoop-jeugd', {
      name: 'Bikefit – aankoop nieuwe fiets – Jeugd',
      sortOrder: 31,
    });
    const decision = decideYouthPackage({
      ...base,
      offering: online,
      variants: [
        variant(online.id, 'adult', null, 27500),
        variant(online.id, 'youth', 's-own', 15000),
      ],
      services: [own],
      subscriptions: [sub('p2', 's-own')],
      defaultYouthServiceSlug: null,
    });
    expect(decision.service).toMatchObject({
      kind: 'create',
      facts: {
        slug: 'bikefit-nieuwe-fiets-jeugd-pakket',
        name: 'Bikefit – aankoop nieuwe fiets – Jeugd – volledig pakket',
        choiceLabel: 'Jeugd – volledig pakket',
        sortOrder: 32,
        durationMinutes: 120,
        requiresGuardian: true,
      },
    });
    expect(packageServiceName('Jeugdfit – eenmalig')).toBe('Jeugdfit – volledig pakket');
    expect(packageServiceName('Bikefit – aankoop nieuwe fiets – Jeugd – eenmalig')).toBe(
      'Bikefit – aankoop nieuwe fiets – Jeugd – volledig pakket',
    );
  });

  it('needs the audience split and the Jeugd – eenmalig variant first', () => {
    expect(
      decideYouthPackage({ ...base, offering: offering('x', 'direct', 'single') }).blockers,
    ).toEqual([expect.stringContaining('not split by audience')]);
    expect(
      decideYouthPackage({ ...base, variants: [variant(huidige.id, 'adult', 's-adult', 27500)] })
        .blockers,
    ).toEqual([expect.stringContaining('has no Jeugd – eenmalig variant')]);
  });
});
