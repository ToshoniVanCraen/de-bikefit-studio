import { describe, expect, it } from 'vitest';
import { formatPriceInProse } from '@/lib/booking/format';
import {
  decideProviderRemoval,
  decideYouthPackage,
  STAGING_RETAIN_FLAG,
  type ProviderMode,
  type ProviderRow,
  type ServiceRow,
  type SubscriptionRow,
  type VariantRow,
} from './aanbod-correcties-youth.mjs';

/**
 * `--staging-retain-toshoni` (Toshoni, 27 Oct 2026, 15:12; staging only): on a
 * database whose one provider is Toshoni, as staging's is, he stays a provider with
 * every offering and is offered the youth package too; on any other database
 * (production has a second provider) the flag stops the run. Without the flag
 * nothing changed: that database still stops, and with a second provider his
 * offerings go and the package goes to the other provider only.
 */

/** The login staging's profile has: the default of `cms:seed-booking`. */
const SEED_LOGIN = 'toshoni@gmail.com';
const PRICE = formatPriceInProse(27500);

const provider = (
  id: string,
  displayName: string,
  userEmail: string,
  over: Partial<ProviderRow> = {},
): ProviderRow => ({ id, displayName, userEmail, isActive: true, userActive: true, ...over });
const sub = (
  providerId: string,
  serviceId: string,
  locationId: string | null = null,
): SubscriptionRow => ({ providerId, serviceId, locationId });
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
const variant = (
  offeringId: string,
  audience: string,
  serviceId: string | null,
  priceCents: number | null,
): VariantRow => ({ offeringId, audience, serviceId, priceCents });

// Staging on 27 Oct 2026: one provider, five offerings (guards: services 5, subscriptions 5).
const toshoni = provider('p1', 'Toshoni Van Craen', SEED_LOGIN);
const winston = provider('p2', 'Winston', 'winston@example.com');
const services = [
  service('s-adult', 'volwassenenfit', { sortOrder: 60 }),
  service('s-youth', 'jeugdfit', { sortOrder: 61 }),
  service('s-foot', 'voetanalyse'),
  service('s-saddle', 'zadelanalyse'),
  service('s-cleat', 'afstellen-schoenplaatjes'),
];
const his = services.map((entry) => sub('p1', entry.id));
const huidige = {
  id: 'o-huidige',
  slug: 'bikefit-huidige-fiets',
  title: 'Bikefit – huidige fiets',
  bookingMode: 'direct',
  variantMode: 'audience',
};
const fits = [
  variant(huidige.id, 'adult', 's-adult', 27500),
  variant(huidige.id, 'youth', 's-youth', 15000),
];

const removal = (
  providers: ProviderRow[],
  subscriptions: SubscriptionRow[],
  providerMode?: ProviderMode,
  planned: Array<Pick<SubscriptionRow, 'providerId' | 'serviceId'>> = [],
) => decideProviderRemoval({ providers, subscriptions, services, planned, providerMode });
const packageOf = (
  providers: ProviderRow[],
  subscriptions: SubscriptionRow[],
  providerMode?: ProviderMode,
  more: { services?: ServiceRow[]; variants?: VariantRow[] } = {},
) =>
  decideYouthPackage({
    offering: huidige,
    variants: more.variants ?? fits,
    services: more.services ?? services,
    subscriptions,
    providers,
    targetPriceCents: 27500,
    defaultYouthServiceSlug: 'jeugdfit',
    providerMode,
  });

const SCOPE = `provider Toshoni: ${STAGING_RETAIN_FLAG} is for a database whose only provider is Toshoni (staging)`;

describe('--staging-retain-toshoni on staging: Toshoni Van Craen, the only provider, stays', () => {
  it('removes nothing and blocks nothing, and names him (the verify looks him up)', () => {
    expect(removal([toshoni], his, 'staging-retain')).toEqual({
      provider: { id: 'p1', displayName: 'Toshoni Van Craen' },
      rows: [],
      changes: [],
      blockers: [],
    });
    // Matched by his login alone (a renamed profile) he is still the one provider it is for.
    expect(removal([provider('p1', 'Iemand anders', SEED_LOGIN)], his, 'staging-retain')).toEqual({
      provider: { id: 'p1', displayName: 'Iemand anders' },
      rows: [],
      changes: [],
      blockers: [],
    });
  });

  it('offers him the youth package like anybody else: offered by 1 provider(s), no blocker', () => {
    const pack = packageOf([toshoni], his, 'staging-retain');
    expect(pack.action).toBe('update');
    expect(pack.blockers).toEqual([]);
    expect(pack.subscribe).toEqual([{ providerId: 'p1', locationId: null }]);
    expect(pack.changes).toEqual([
      `Jeugd – volledig pakket: add variant at ${PRICE}`,
      `new service jeugdfit-pakket ("Jeugdfit – volledig pakket", 120 min, ${PRICE})`,
      'offered by 1 provider(s)',
    ]);
    // From where he offers the youth fit, as for anybody.
    const fromStudio = [
      ...his.filter((row) => row.serviceId !== 's-youth'),
      sub('p1', 's-youth', 'l1'),
    ];
    expect(packageOf([toshoni], fromStudio, 'staging-retain').subscribe).toEqual([
      { providerId: 'p1', locationId: 'l1' },
    ]);
  });

  it('a package service he offers already (the bootstrap and cms:seed-booking) needs nothing more', () => {
    const made = service('s-pack', 'jeugdfit-pakket', { priceCents: 27500, showPrice: true });
    const done = packageOf([toshoni], [...his, sub('p1', 's-pack')], 'staging-retain', {
      services: [...services, made],
      variants: [...fits, variant(huidige.id, 'youth-package', 's-pack', 27500)],
    });
    expect(done).toMatchObject({ action: 'none', subscribe: [], changes: [], blockers: [] });
  });
});

describe('--staging-retain-toshoni on any other database stops the run (!)', () => {
  it('two providers, as production has (active or not), more, or none at all', () => {
    const cases: Array<[ProviderRow[], number]> = [
      [[toshoni, winston], 2],
      [[toshoni, { ...winston, isActive: false }], 2],
      [[toshoni, winston, provider('p3', 'Derde', 'derde@example.com', { userActive: false })], 3],
      [[], 0],
    ];
    for (const [providers, count] of cases) {
      expect(removal(providers, his, 'staging-retain')).toEqual({
        provider: null,
        rows: [],
        changes: [],
        blockers: [`${SCOPE}; this one has ${count} provider(s) — run without it`],
      });
    }
  });

  it('one provider who is not him', () => {
    expect(removal([winston], [sub('p2', 's-adult')], 'staging-retain').blockers).toEqual([
      `${SCOPE}; its one provider "Winston" is not him (display name "Toshoni" or "Toshoni Van Craen", or the login of cms:seed-booking) — stop and report`,
    ]);
  });

  it('him switched off, or his login', () => {
    for (const off of [{ isActive: false }, { userActive: false }]) {
      expect(
        removal([provider('p1', 'Toshoni Van Craen', SEED_LOGIN, off)], his, 'staging-retain'),
      ).toEqual({
        provider: null,
        rows: [],
        changes: [],
        blockers: [
          'provider Toshoni Van Craen: --staging-retain-toshoni keeps him as the only provider, but his profile or its login is switched off — stop and report',
        ],
      });
    }
  });

  it('never puts his login in a decision', () => {
    for (const decision of [
      removal([toshoni], his, 'staging-retain'),
      removal([provider('p1', 'Iemand anders', SEED_LOGIN), winston], his, 'staging-retain'),
      removal(
        [provider('p1', 'Iemand anders', SEED_LOGIN, { isActive: false })],
        his,
        'staging-retain',
      ),
      packageOf([toshoni], his, 'staging-retain'),
    ]) {
      expect(JSON.stringify(decision)).not.toContain('gmail');
    }
  });
});

describe('without the flag nothing changed', () => {
  it('the same database still stops: the fits would be left without a provider, the package offered by nobody', () => {
    for (const mode of [undefined, 'remove'] as const) {
      const decision = removal([toshoni], his, mode);
      expect(decision.provider).toEqual({ id: 'p1', displayName: 'Toshoni Van Craen' });
      expect(decision.rows).toEqual(his);
      expect(decision.blockers).toEqual(
        services.map(
          (entry) =>
            `provider Toshoni Van Craen: service ${entry.slug} would be left without a provider — add a replacement provider for it in Beheer → Aanbieders first`,
        ),
      );
      const pack = packageOf([toshoni], his, mode);
      expect(pack.subscribe).toEqual([]);
      expect(pack.blockers).toEqual([
        'offering bikefit-huidige-fiets: Jeugd – volledig pakket would be offered by no provider — add a replacement provider for jeugdfit in Beheer → Aanbieders first',
      ]);
    }
  });

  it('with a second provider his offerings go and the package goes to the other provider only; the flag would stop there', () => {
    const subscriptions = [...his, ...services.map((entry) => sub('p2', entry.id))];
    const pack = packageOf([toshoni, winston], subscriptions, 'remove');
    expect(pack.subscribe).toEqual([{ providerId: 'p2', locationId: null }]);
    const gone = removal(
      [toshoni, winston],
      subscriptions,
      'remove',
      pack.subscribe.map((target) => ({ providerId: target.providerId, serviceId: 'new:package' })),
    );
    expect(gone).toEqual({
      provider: { id: 'p1', displayName: 'Toshoni Van Craen' },
      rows: his,
      changes: [
        '5 offering(s) removed: volwassenenfit, jeugdfit, voetanalyse, zadelanalyse, afstellen-schoenplaatjes',
      ],
      blockers: [],
    });
    expect(removal([toshoni, winston], subscriptions, 'staging-retain').blockers).toEqual([
      `${SCOPE}; this one has 2 provider(s) — run without it`,
    ]);
  });
});
