import { describe, expect, it } from 'vitest';
import {
  decideProviderRemoval,
  type ProviderRow,
  type ServiceRef,
  type SubscriptionRow,
} from './aanbod-correcties-youth.mjs';

/**
 * The provider Toshoni, the section of `cms:patch-aanbod-correcties` that looks
 * at who offers what, on plain data: a database in the state of 20 Oct 2026 as
 * production holds it (Toshoni and a second provider), one that is done, and an
 * admin's own edit. Who Toshoni is, and staging's state (one provider), are
 * `aanbod-correcties-youth-toshoni.test.ts`.
 */

const provider = (
  id: string,
  displayName: string,
  over: Partial<ProviderRow> = {},
): ProviderRow => ({
  id,
  displayName,
  isActive: true,
  userActive: true,
  userEmail: `${id}@example.com`,
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
const service = (id: string, slug: string, over: Partial<ServiceRef> = {}): ServiceRef => ({
  id,
  slug,
  name: slug,
  isActive: true,
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
    expect(decision.provider).toEqual({ id: 'p1', displayName: 'Toshoni' });
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
      'provider Toshoni: service jeugdfit would be left without a provider — add a replacement provider for it in Beheer → Aanbieders first',
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

  it('does nothing without providers or without offerings; refuses providers without him, and two of his name', () => {
    expect(
      decideProviderRemoval({ providers: [], subscriptions: [], services, planned: [] }),
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
    expect(none.blockers).toEqual([]);
    // Providers, but none of them him: fail closed (see aanbod-correcties-youth-toshoni.test.ts).
    expect(
      decideProviderRemoval({ providers: [other], subscriptions: [], services, planned: [] })
        .blockers,
    ).toEqual([expect.stringContaining('provider Toshoni: no provider profile matches')]);
    const twice = decideProviderRemoval({
      providers: [toshoni, provider('p9', 'toshoni')],
      subscriptions: [],
      services,
      planned: [],
    });
    expect(twice.blockers).toEqual([
      'provider Toshoni: 2 provider profiles match — "Toshoni" (by display name), "toshoni" (by display name); rename the one that is not his in Beheer → Aanbieders (or change its login), then run again',
    ]);
  });
});
