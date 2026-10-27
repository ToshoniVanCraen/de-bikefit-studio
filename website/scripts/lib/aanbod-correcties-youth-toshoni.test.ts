import { describe, expect, it } from 'vitest';
import { FIRST_PROVIDER } from './first-provider.mjs';
import {
  decideProviderRemoval,
  decideYouthPackage,
  isToshoni,
  normalizedName,
  TOSHONI,
  type ProviderRow,
  type ServiceRow,
  type SubscriptionRow,
  type VariantRow,
} from './aanbod-correcties-youth.mjs';

/**
 * Who Toshoni is for `cms:patch-aanbod-correcties`, and the state staging held at
 * the dry run of 27 Oct 2026: one provider, "Toshoni Van Craen", who logs in as the
 * first provider of `cms:seed-booking` and alone offers the fits. The rule knew only
 * the name "Toshoni" then: the dry run did not find him ("no such provider"),
 * planned the youth package for him and blocked nothing. Not finding him among
 * providers now stops the patch (fail closed), and so does finding him twice.
 */

/** The login staging's profile has: the default of `cms:seed-booking`. */
const SEED_LOGIN = 'toshoni@gmail.com';

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

describe('who Toshoni is', () => {
  const nobody = 'iemand@example.com';

  it('the login cms:seed-booking gives him, whatever the profile is called', () => {
    expect(TOSHONI.userEmails).toEqual([FIRST_PROVIDER.email]);
    expect(FIRST_PROVIDER.email).toBe(SEED_LOGIN);
    expect(isToshoni({ displayName: 'Iemand anders', userEmail: SEED_LOGIN })).toBe(true);
    // Compared as sign-in compares logins (`normalizeEmail`, `src/lib/email-address.ts`).
    expect(isToshoni({ displayName: 'Iemand anders', userEmail: ' Toshoni@Gmail.COM ' })).toBe(
      true,
    );
  });

  it('or exactly one of his names, whatever the case, spacing, accents or character width', () => {
    expect(TOSHONI.displayNames).toEqual([FIRST_PROVIDER.displayName, 'Toshoni Van Craen']);
    for (const name of [
      'Toshoni',
      ' toshoni ',
      'TOSHONI',
      'Toshoni Van Craen',
      'toshoni  van\tcraen',
      'Toshoni\u00a0Van Craen',
      'Tóshoni Van Cräen',
      'Ｔｏｓｈｏｎｉ',
    ]) {
      expect(isToshoni({ displayName: name, userEmail: nobody }), name).toBe(true);
    }
    expect(normalizedName(' Toshoni\u00a0 VAN  Cräen ')).toBe('toshoni van craen');
  });

  it('never a part of a name or of a login, and nobody else', () => {
    for (const name of [
      'Toshoni Van Craen Jr',
      'Toshoni2',
      'Toshon',
      'Toshoni (assistent)',
      'Van Craen',
      'Winston',
      '',
    ]) {
      expect(isToshoni({ displayName: name, userEmail: nobody }), name).toBe(false);
    }
    for (const login of [
      'xtoshoni@gmail.com',
      'toshoni@gmail.com.be',
      'toshoni+studio@gmail.com',
      'toshoni@gmail.co',
    ]) {
      expect(isToshoni({ displayName: 'Winston', userEmail: login }), login).toBe(false);
    }
  });
});

describe('staging on 27 Oct 2026: Toshoni Van Craen is the only provider of the fits', () => {
  const toshoni = provider('p1', 'Toshoni Van Craen', SEED_LOGIN);
  const winston = provider('p2', 'Winston', 'winston@example.com');
  const adult = service('s-adult', 'volwassenenfit', { sortOrder: 60 });
  const youth = service('s-youth', 'jeugdfit', { sortOrder: 61 });
  const foot = service('s-foot', 'voetanalyse');
  const services = [adult, youth, foot];
  const his = [sub('p1', 's-adult'), sub('p1', 's-youth'), sub('p1', 's-foot')];
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
  const packageOf = (
    providers: ProviderRow[],
    subscriptions: SubscriptionRow[],
    extra: ServiceRow[] = [],
  ) =>
    decideYouthPackage({
      offering: huidige,
      variants: fits,
      services: [...services, ...extra],
      subscriptions,
      providers,
      targetPriceCents: 27500,
      defaultYouthServiceSlug: 'jeugdfit',
    });

  it('finds him, and refuses to take him off a service nobody else offers, naming the fix', () => {
    const decision = decideProviderRemoval({
      providers: [toshoni],
      subscriptions: his,
      services,
      planned: [],
    });
    expect(decision.provider).toEqual({ id: 'p1', displayName: 'Toshoni Van Craen' });
    expect(decision.rows).toEqual(his);
    expect(decision.changes).toEqual([
      '3 offering(s) removed: volwassenenfit, jeugdfit, voetanalyse',
    ]);
    expect(decision.blockers).toEqual(
      ['volwassenenfit', 'jeugdfit', 'voetanalyse'].map(
        (slug) =>
          `provider Toshoni Van Craen: service ${slug} would be left without a provider — add a replacement provider for it in Beheer → Aanbieders first`,
      ),
    );
    // A provider who offers nothing, or is switched off, does not count as a replacement.
    const idle = decideProviderRemoval({
      providers: [toshoni, winston, provider('p3', 'Weg', 'weg@example.com', { isActive: false })],
      subscriptions: [...his, sub('p3', 's-adult')],
      services,
      planned: [],
    });
    expect(idle.blockers).toHaveLength(3);
  });

  it('does not offer him the package, and refuses a package nobody would offer', () => {
    const decision = packageOf([toshoni], his);
    expect(decision.subscribe).toEqual([]);
    expect(decision.action).toBe('blocked');
    expect(decision.blockers).toEqual([
      'offering bikefit-huidige-fiets: Jeugd – volledig pakket would be offered by no provider — add a replacement provider for jeugdfit in Beheer → Aanbieders first',
    ]);
    // What it would do is still told, without a provider.
    expect(decision.changes).toEqual([
      expect.stringContaining('add variant'),
      expect.stringContaining('new service jeugdfit-pakket'),
    ]);
  });

  it('never puts his login in a decision', () => {
    const twice = decideProviderRemoval({
      providers: [
        provider('p1', 'Iemand anders', SEED_LOGIN),
        provider('p9', 'Toshoni Van Craen', 'tvc@example.com'),
      ],
      subscriptions: his,
      services,
      planned: [],
    });
    expect(twice.provider).toBeNull();
    expect(twice.blockers).toEqual([
      'provider Toshoni: 2 provider profiles match — "Iemand anders" (by login), "Toshoni Van Craen" (by display name); rename the one that is not his in Beheer → Aanbieders (or change its login), then run again',
    ]);
    const both = decideProviderRemoval({
      providers: [toshoni, provider('p9', 'toshoni', 'iemand@example.com')],
      subscriptions: his,
      services,
      planned: [],
    });
    expect(both.blockers).toEqual([
      expect.stringContaining(
        '"Toshoni Van Craen" (by display name and login), "toshoni" (by display name);',
      ),
    ]);
    const removal = decideProviderRemoval({
      providers: [toshoni],
      subscriptions: his,
      services,
      planned: [],
    });
    for (const decision of [removal, twice, packageOf([toshoni], his)]) {
      expect(JSON.stringify(decision)).not.toContain('gmail');
    }
  });

  it('a profile renamed "Toshoni V." on another login matches nobody: the patch stops instead of treating him as anybody else', () => {
    const renamed = provider('p1', 'Toshoni V.', 'toshoni.v@example.com');
    const subscriptions = [...his, sub('p2', 's-adult'), sub('p2', 's-youth'), sub('p2', 's-foot')];
    const removal = decideProviderRemoval({
      providers: [renamed, winston],
      subscriptions,
      services,
      planned: [],
    });
    expect(removal).toEqual({
      provider: null,
      rows: [],
      changes: [],
      blockers: [
        'provider Toshoni: no provider profile matches (display name "Toshoni" or "Toshoni Van Craen", or the login of cms:seed-booking) — stop and report; check Beheer → Aanbieders, do not rename a profile blindly',
      ],
    });
    expect(JSON.stringify(removal)).not.toContain('example.com');
    // What the stop prevents: without it he would be offered the package like anybody else.
    expect(
      packageOf([renamed, winston], subscriptions).subscribe.map((target) => target.providerId),
    ).toEqual(['p1', 'p2']);
    // A database without any provider has nothing to remove (the package stops on its own).
    expect(
      decideProviderRemoval({ providers: [], subscriptions: [], services, planned: [] }).blockers,
    ).toEqual([]);
  });

  it('with a replacement who offers the fits: his offerings go, the package goes to the replacement only', () => {
    const subscriptions = [
      ...his,
      sub('p2', 's-adult'),
      sub('p2', 's-youth', 'l-studio'),
      sub('p2', 's-foot'),
    ];
    const pack = packageOf([toshoni, winston], subscriptions);
    expect(pack.action).toBe('update');
    expect(pack.subscribe).toEqual([{ providerId: 'p2', locationId: 'l-studio' }]);
    expect(pack.changes.at(-1)).toBe('offered by 1 provider(s)');
    const removal = decideProviderRemoval({
      providers: [toshoni, winston],
      subscriptions,
      services,
      planned: pack.subscribe.map((target) => ({ ...target, serviceId: 'new:package' })),
    });
    expect(removal.provider).toEqual({ id: 'p1', displayName: 'Toshoni Van Craen' });
    expect(removal.rows).toEqual(his);
    expect(removal.blockers).toEqual([]);
  });

  it('a package service the bootstrap made that only he offers is refused too; one another provider offers is not', () => {
    const made = service('s-pack', 'jeugdfit-pakket', { priceCents: 27500, showPrice: true });
    const onlyHim = [sub('p1', 's-youth'), sub('p1', 's-pack')];
    expect(packageOf([toshoni], onlyHim, [made]).blockers).toEqual([
      expect.stringContaining('would be offered by no provider'),
    ]);
    const shared = packageOf([toshoni, winston], [...onlyHim, sub('p2', 's-pack')], [made]);
    expect(shared.blockers).toEqual([]);
    expect(shared.subscribe).toEqual([]);
    expect(shared.action).toBe('update');
  });
});
