import { describe, expect, it } from 'vitest';
import { FIRST_PROVIDER } from './first-provider.mjs';
import {
  decideProviderRemoval,
  isToshoni,
  normalizedName,
  TOSHONI,
  type ProviderRow,
  type ServiceRef,
  type SubscriptionRow,
} from './aanbod-correcties-youth.mjs';

/**
 * Who Toshoni is for `cms:patch-aanbod-correcties`, and the state staging held at
 * the dry run of 27 Oct 2026: one provider, "Toshoni Van Craen", who logs in as the
 * first provider of `cms:seed-booking` and alone offers the fits. The rule knew only
 * the name "Toshoni" then: the dry run did not find him ("no such provider") and
 * blocked nothing. Not finding him among providers now stops the patch (fail
 * closed), and so does finding him twice.
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
const service = (id: string, slug: string): ServiceRef => ({
  id,
  slug,
  name: slug,
  isActive: true,
});

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
  const adult = service('s-adult', 'volwassenenfit');
  const youth = service('s-youth', 'jeugdfit');
  const foot = service('s-foot', 'voetanalyse');
  const services = [adult, youth, foot];
  const his = [sub('p1', 's-adult'), sub('p1', 's-youth'), sub('p1', 's-foot')];

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
    for (const decision of [removal, twice]) {
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
    // A database without any provider has nothing to remove.
    expect(
      decideProviderRemoval({ providers: [], subscriptions: [], services, planned: [] }).blockers,
    ).toEqual([]);
  });

  it('with a replacement who offers the fits: his offerings go', () => {
    const subscriptions = [
      ...his,
      sub('p2', 's-adult'),
      sub('p2', 's-youth', 'l-studio'),
      sub('p2', 's-foot'),
    ];
    const removal = decideProviderRemoval({
      providers: [toshoni, winston],
      subscriptions,
      services,
      planned: [],
    });
    expect(removal.provider).toEqual({ id: 'p1', displayName: 'Toshoni Van Craen' });
    expect(removal.rows).toEqual(his);
    expect(removal.blockers).toEqual([]);
  });
});
