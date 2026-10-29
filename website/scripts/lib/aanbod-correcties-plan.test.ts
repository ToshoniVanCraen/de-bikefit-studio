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
 * world that holds only what the provider, the guardian and the package-guard
 * sections read: both bikefits split by audience (the current-bike fit booked
 * online through `volwassenenfit` and `jeugdfit`, which still asks for a
 * guardian), five services, and staging's one provider or production's two. The
 * other sections block on such a world (no settings, no pages); what is pinned
 * here is the provider, the guardian rule, that no youth package is made (and a
 * database that holds one blocks), the row counts the verify holds the apply to,
 * and the provider and guardian lines of the printout.
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
  // Before 29 Oct 2026 the Jeugd service asked for a parent or guardian.
  requiresGuardian: slug === 'jeugdfit',
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
  more: { services?: typeof services; variants?: typeof variants } = {},
): World {
  const allServices = more.services ?? services;
  const allVariants = more.variants ?? variants;
  const counts: Counts = {
    pages: 0,
    blocks: 0,
    offerings: offerings.length,
    variants: allVariants.length,
    services: allServices.length,
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
    variants: allVariants,
    services: allServices,
    providers,
    subscriptions,
    counts,
  } as unknown as World;
}

const plan = (world: World, mode?: ProviderMode) => planCorrecties(world, defaultInputs(), mode);
/** The blockers of the sections that look at who offers what (the others block on this world). */
const whoOffers = (result: CorrectiesPlan) =>
  correctiesBlockers(result).filter((line) => line.startsWith('provider '));
/** The whole printout. */
const printout = (result: CorrectiesPlan) => {
  const lines: string[] = [];
  printCorrectiesPlan(result, (symbol, message) => lines.push(`${symbol} ${message}`));
  return lines;
};
/** The provider lines of the printout. */
const printed = (result: CorrectiesPlan) =>
  printout(result).filter((line) => /^[=~→] provider/.test(line));

const staging = worldWith([toshoni], offersAll('p1'));
const production = worldWith([toshoni, winston], [...offersAll('p1'), ...offersAll('p2')]);

describe('planCorrecties with --staging-retain-toshoni on staging (Toshoni Van Craen the only provider)', () => {
  const result = plan(staging, 'staging-retain');

  it('removes none of his offerings, blocks nothing of the provider, and keeps the mode', () => {
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

  it('makes no youth package: no variant, no service, no subscription; only the guardian rule goes off', () => {
    expect(result.packageGuard).toEqual({ changes: [], blockers: [], action: 'none' });
    expect(result.guardians.map((entry) => [entry.row.slug, entry.changes, entry.action])).toEqual([
      ['jeugdfit', ['requiresGuardian: true → false'], 'update'],
    ]);
    expect(result.expected).toEqual(result.guards);
    expect(describeCountChanges(result.guards, result.expected)).toBe('');
  });

  it('prints the guardian change of the youth service and no package line', () => {
    const lines = printout(result);
    expect(lines).toContain('~ service jeugdfit — requiresGuardian: true → false');
    expect(lines.filter((line) => /pakket|package/i.test(line))).toEqual([]);
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
  it('staging still stops: his removal would leave every service without a provider', () => {
    for (const result of [plan(staging), plan(staging, 'remove')]) {
      expect(result.providerMode).toBe('remove');
      expect(result.provider.rows).toEqual(offersAll('p1'));
      expect(result.provider.kept).toEqual([]);
      expect(whoOffers(result)).toEqual([
        ...SLUGS.map(
          (slug) =>
            `provider Toshoni Van Craen: service ${slug} would be left without a provider — add a replacement provider for it in Beheer → Aanbieders first`,
        ),
      ]);
    }
  });

  it('production: his five offerings go to nobody new; five subscriptions fewer, no package', () => {
    const result = plan(production);
    expect(result.provider).toMatchObject({
      provider: { id: 'p1', displayName: 'Toshoni Van Craen' },
      rows: offersAll('p1'),
      kept: [],
      blockers: [],
      action: 'update',
    });
    expect(whoOffers(result)).toEqual([]);
    expect(result.expected).toEqual({
      ...result.guards,
      subscriptions: result.guards.subscriptions - 5,
    });
    expect(result.guardians.map((entry) => entry.changes)).toEqual([
      ['requiresGuardian: true → false'],
    ]);
    expect(printed(result)).toEqual([
      '~ provider Toshoni Van Craen — 5 offering(s) removed: volwassenenfit, jeugdfit, voetanalyse, zadelanalyse, afstellen-schoenplaatjes',
      '→ provider list: cached for up to 5 minutes, so Toshoni Van Craen leaves the options within that time',
    ]);
  });
});

describe('the youth package of 27 Oct 2026 is withdrawn (Toshoni, 29 Oct 2026)', () => {
  const packaged = (extra: { services?: typeof services; variants?: typeof variants }) =>
    plan(worldWith([toshoni, winston], [...offersAll('p1'), ...offersAll('p2')], extra));
  const guard = (result: CorrectiesPlan) =>
    correctiesBlockers(result).filter((line) => line.startsWith('youth package:'));

  it('a database that holds its variant or service blocks the plan with one line: restore the 27 Oct backup first', () => {
    const pakket = { ...services[1], id: 's-pakket', slug: 'jeugdfit-pakket', name: 'pakket' };
    const result = packaged({
      services: [...services, pakket],
      variants: [
        ...variants,
        {
          offeringId: 'o-bikefit-huidige-fiets',
          audience: 'youth-package',
          serviceId: 's-pakket',
          priceCents: 27500,
        },
      ],
    });
    expect(guard(result)).toEqual([
      'youth package: this database holds the withdrawn "Jeugd – volledig pakket" (variant youth-package of bikefit-huidige-fiets, service jeugdfit-pakket) — restore the backup of 27 Oct 2026 first, then run again',
    ]);
    expect(correctiesBlockers(result)[0]).toBe(guard(result)[0]);
    expect(result.packageGuard.action).toBe('blocked');
  });

  it('so does a package service a Beheer save made for a fit (`<offering>-jeugd-pakket`), on its own', () => {
    const made = {
      ...services[1],
      id: 's-nb',
      slug: 'bikefit-nieuwe-fiets-jeugd-pakket',
      name: 'nb',
    };
    expect(guard(packaged({ services: [...services, made] }))).toEqual([
      expect.stringContaining('(service bikefit-nieuwe-fiets-jeugd-pakket)'),
    ]);
  });

  it('a youth service that asks for no guardian already is as intended; other services are not looked at', () => {
    const done = services.map((entry) => ({
      ...entry,
      requiresGuardian: entry.slug === 'voetanalyse',
    }));
    const result = packaged({ services: done });
    expect(guard(result)).toEqual([]);
    expect(result.guardians.map((entry) => [entry.row.slug, entry.action])).toEqual([
      ['jeugdfit', 'none'],
    ]);
    expect(printout(result)).toContain('= service jeugdfit — no guardian asked for');
    expect(
      printout(result).filter((line) => line.includes('voetanalyse — requiresGuardian')),
    ).toEqual([]);
  });
});
