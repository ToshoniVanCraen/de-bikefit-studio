import { describe, expect, it } from 'vitest';
import {
  correctiesBlockers,
  defaultInputs,
  planCorrecties,
  type CorrectiesPlan,
} from './aanbod-correcties-plan.mjs';
import { describeCountChanges, printCorrectiesPlan } from './aanbod-correcties-print.mjs';
import type { Counts, World } from './aanbod-correcties-world.mjs';
import type { ProviderMode } from './aanbod-correcties-youth.mjs';

/**
 * The whole plan of `cms:patch-aanbod-correcties` in both provider modes, on a
 * world that holds only what the youth package and the provider sections read:
 * both bikefits split by audience (the current-bike fit booked online through
 * `volwassenenfit` and `jeugdfit`), five services, and staging's one provider or
 * production's two. The other sections block on such a world (no settings, no
 * pages); what is pinned here is the provider, the package, the row counts the
 * verify holds the apply to, and the provider line of the printout.
 */

const SEED_LOGIN = 'toshoni@gmail.com';
const SLUGS = [
  'volwassenenfit',
  'jeugdfit',
  'voetanalyse',
  'zadelanalyse',
  'afstellen-schoenplaatjes',
];
const services = SLUGS.map((slug, index) => ({
  id: `s-${slug}`,
  locale: 'nl',
  slug,
  name: slug,
  choiceLabel: '',
  description: '',
  durationMinutes: 120,
  bufferAfterMinutes: 15,
  priceCents: null,
  showPrice: false,
  locationId: null,
  requiresGuardian: false,
  isActive: true,
  sortOrder: 60 + index,
}));
const offering = (slug: string, bookingMode: string) => ({
  id: `o-${slug}`,
  locale: 'nl',
  slug,
  title: slug,
  summary: '',
  bookingMode,
  variantMode: 'audience',
});
const offerings = [
  offering('bikefit-huidige-fiets', 'direct'),
  offering('bikefit-nieuwe-fiets', 'enquiry'),
];
const variants = [
  {
    offeringId: 'o-bikefit-huidige-fiets',
    audience: 'adult',
    serviceId: 's-volwassenenfit',
    priceCents: 27500,
  },
  {
    offeringId: 'o-bikefit-huidige-fiets',
    audience: 'youth',
    serviceId: 's-jeugdfit',
    priceCents: 15000,
  },
  { offeringId: 'o-bikefit-nieuwe-fiets', audience: 'adult', serviceId: null, priceCents: 27500 },
  { offeringId: 'o-bikefit-nieuwe-fiets', audience: 'youth', serviceId: null, priceCents: 15000 },
];
const toshoni = {
  id: 'p1',
  displayName: 'Toshoni Van Craen',
  isActive: true,
  userActive: true,
  userEmail: SEED_LOGIN,
};
const winston = { ...toshoni, id: 'p2', displayName: 'Winston', userEmail: 'winston@example.com' };
const offersAll = (providerId: string) =>
  services.map((entry) => ({ providerId, serviceId: entry.id, locationId: null }));

/** A world with these providers and subscriptions; the counts are those of the rows. */
function worldWith(
  providers: ReadonlyArray<typeof toshoni>,
  subscriptions: ReadonlyArray<{ providerId: string; serviceId: string; locationId: null }>,
): World {
  const counts: Counts = {
    pages: 0,
    blocks: 0,
    offerings: offerings.length,
    variants: variants.length,
    services: services.length,
    bookings: 3,
    providers: providers.length,
    subscriptions: subscriptions.length,
  };
  return {
    locale: 'nl',
    settings: new Map(),
    locations: [],
    mainMenu: { exists: false, items: null },
    pages: [],
    offerings,
    variants,
    services,
    providers,
    subscriptions,
    counts,
  } as unknown as World;
}

const plan = (world: World, mode?: ProviderMode) => planCorrecties(world, defaultInputs(), mode);
const packageOf = (result: CorrectiesPlan) =>
  result.packages.find((entry) => entry.slug === 'bikefit-huidige-fiets');
/** The blockers of the sections that look at who offers what (the others block on this world). */
const whoOffers = (result: CorrectiesPlan) =>
  correctiesBlockers(result).filter(
    (line) => line.startsWith('provider ') || line.includes('would be offered by no provider'),
  );
/** The provider lines of the printout (the variant line names a count of providers too). */
const printed = (result: CorrectiesPlan) => {
  const lines: string[] = [];
  printCorrectiesPlan(result, (symbol, message) => lines.push(`${symbol} ${message}`));
  return lines.filter((line) => /^[=~→] provider/.test(line));
};

const staging = worldWith([toshoni], offersAll('p1'));
const production = worldWith([toshoni, winston], [...offersAll('p1'), ...offersAll('p2')]);

describe('planCorrecties with --staging-retain-toshoni on staging (Toshoni Van Craen the only provider)', () => {
  const result = plan(staging, 'staging-retain');

  it('removes none of his offerings, blocks nothing of the provider or the package, and keeps the mode', () => {
    expect(result.providerMode).toBe('staging-retain');
    expect(result.provider).toEqual({
      provider: { id: 'p1', displayName: 'Toshoni Van Craen' },
      rows: [],
      kept: offersAll('p1'),
      changes: [],
      blockers: [],
      action: 'none',
    });
    expect(whoOffers(result)).toEqual([]);
  });

  it('subscribes him to the package of the fit that is booked online, and nobody to the one that is asked for', () => {
    expect(packageOf(result)).toMatchObject({
      action: 'update',
      variant: 'create',
      service: { kind: 'create', facts: { slug: 'jeugdfit-pakket' } },
      subscribe: [{ providerId: 'p1', locationId: null }],
      blockers: [],
    });
    expect(packageOf(result)?.changes.at(-1)).toBe('offered by 1 provider(s)');
    expect(
      result.packages.find((entry) => entry.slug === 'bikefit-nieuwe-fiets')?.subscribe,
    ).toEqual([]);
  });

  it('expects one service, two variants and one subscription more; no provider and no booking moves', () => {
    expect(result.expected).toEqual({
      ...result.guards,
      variants: result.guards.variants + 2,
      services: result.guards.services + 1,
      subscriptions: result.guards.subscriptions + 1,
    });
    expect(describeCountChanges(result.guards, result.expected)).toBe(
      'variants 6 (+2), services 6 (+1), subscriptions 6 (+1)',
    );
  });

  it('prints him as kept, without the provider-list line of a removal', () => {
    expect(printed(result)).toEqual([
      '= provider Toshoni Van Craen — kept as provider (--staging-retain-toshoni): 5 offering(s) stay',
    ]);
  });
});

describe('planCorrecties with --staging-retain-toshoni on production (a second provider)', () => {
  it('stops on the provider; nothing of his is removed, nothing printed for him', () => {
    const result = plan(production, 'staging-retain');
    expect(result.provider).toMatchObject({
      provider: null,
      rows: [],
      kept: [],
      action: 'blocked',
    });
    expect(whoOffers(result)).toEqual([
      'provider Toshoni: --staging-retain-toshoni is for a database whose only provider is Toshoni (staging); this one has 2 provider(s) — run without it',
    ]);
    expect(printed(result)).toEqual([]);
  });
});

describe('planCorrecties without the flag: unchanged', () => {
  it('staging still stops: his removal would leave every service without a provider, the package offered by nobody', () => {
    for (const result of [plan(staging), plan(staging, 'remove')]) {
      expect(result.providerMode).toBe('remove');
      expect(result.provider.rows).toEqual(offersAll('p1'));
      expect(result.provider.kept).toEqual([]);
      expect(whoOffers(result)).toEqual([
        'offering bikefit-huidige-fiets: Jeugd – volledig pakket would be offered by no provider — add a replacement provider for jeugdfit in Beheer → Aanbieders first',
        ...SLUGS.map(
          (slug) =>
            `provider Toshoni Van Craen: service ${slug} would be left without a provider — add a replacement provider for it in Beheer → Aanbieders first`,
        ),
      ]);
    }
  });

  it('production: his five offerings go, the package goes to the other provider; one subscription for five', () => {
    const result = plan(production);
    expect(result.provider).toMatchObject({
      provider: { id: 'p1', displayName: 'Toshoni Van Craen' },
      rows: offersAll('p1'),
      kept: [],
      blockers: [],
      action: 'update',
    });
    expect(packageOf(result)?.subscribe).toEqual([{ providerId: 'p2', locationId: null }]);
    expect(whoOffers(result)).toEqual([]);
    expect(result.expected.subscriptions).toBe(result.guards.subscriptions - 5 + 1);
    expect(printed(result)).toEqual([
      '~ provider Toshoni Van Craen — 5 offering(s) removed: volwassenenfit, jeugdfit, voetanalyse, zadelanalyse, afstellen-schoenplaatjes',
      '→ provider list: cached for up to 5 minutes, so Toshoni Van Craen leaves the options within that time',
    ]);
  });
});
