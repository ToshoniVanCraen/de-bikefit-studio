import { describe, expect, it } from 'vitest';
import {
  offersService,
  providerById,
  providersFor,
  providerSummary,
  resolveProviderStep,
  servicesOf,
} from './provider-choice';
import type { BookingProviderOption, BookingServiceOption } from './types';

function provider(id: string, serviceIds: string[], name = id): BookingProviderOption {
  return {
    id,
    name,
    services: serviceIds.map((serviceId) => ({ serviceId, location: null })),
    locations: [],
  };
}

function service(id: string): BookingServiceOption {
  return {
    id,
    slug: id,
    name: id,
    choiceLabel: '',
    description: '',
    durationMinutes: 60,
    location: null,
    priceLabel: '',
    priceCents: null,
    addons: [],
  };
}

const rutger = provider('rutger', ['volwassene', 'jeugd'], 'Rutger');
const sam = provider('sam', ['volwassene'], 'Sam');
const BOTH = [rutger, sam];

function step(partial: Partial<Parameters<typeof resolveProviderStep>[0]> = {}) {
  return resolveProviderStep({
    providers: BOTH,
    showChoice: true,
    serviceId: null,
    choice: undefined,
    reopened: false,
    ...partial,
  });
}

describe('who can take a service', () => {
  it('knows which provider offers which service', () => {
    expect(offersService(rutger, 'jeugd')).toBe(true);
    expect(offersService(sam, 'jeugd')).toBe(false);
  });

  it('lists everyone while no service is chosen, else only who offers it', () => {
    expect(providersFor(BOTH, null)).toEqual(BOTH);
    expect(providersFor(BOTH, 'volwassene')).toEqual(BOTH);
    expect(providersFor(BOTH, 'jeugd')).toEqual([rutger]);
    expect(providersFor(BOTH, 'onbekend')).toEqual([]);
  });

  it('copies the list instead of handing the input back', () => {
    expect(providersFor(BOTH, null)).not.toBe(BOTH);
  });

  it('finds a provider by id, and nothing for no id or an unknown one', () => {
    expect(providerById(BOTH, 'sam')).toBe(sam);
    expect(providerById(BOTH, null)).toBeNull();
    expect(providerById(BOTH, undefined)).toBeNull();
    expect(providerById(BOTH, 'weg')).toBeNull();
  });

  it('narrows the services to what a provider offers; "Iedereen" keeps them all', () => {
    const all = [service('volwassene'), service('jeugd')];
    expect(servicesOf(all, sam).map((item) => item.id)).toEqual(['volwassene']);
    expect(servicesOf(all, rutger).map((item) => item.id)).toEqual(['volwassene', 'jeugd']);
    expect(servicesOf(all, null)).toEqual(all);
    expect(servicesOf(all, null)).not.toBe(all);
  });
});

describe('Bij wie? with one provider', () => {
  it('is left out and everything is for that provider', () => {
    const solo = step({ providers: [rutger], serviceId: 'volwassene' });
    expect(solo.hasStep).toBe(false);
    expect(solo.open).toBe(false);
    expect(solo.providerId).toBe('rutger');
    expect(solo.picked).toBeNull();
  });

  it('is left out before a service is chosen too', () => {
    const solo = step({ providers: [rutger] });
    expect(solo.hasStep).toBe(false);
    expect(solo.providerId).toBe('rutger');
  });
});

describe('Bij wie? with several providers', () => {
  it('asks first while no service is chosen', () => {
    const first = step();
    expect(first.hasStep).toBe(true);
    expect(first.open).toBe(true);
    expect(first.candidates).toEqual(BOTH);
    expect(first.providerId).toBeNull();
  });

  it('asks for a service that several of them offer', () => {
    const asks = step({ serviceId: 'volwassene' });
    expect(asks.hasStep).toBe(true);
    expect(asks.open).toBe(true);
    expect(asks.candidates).toEqual(BOTH);
  });

  it('is left out for a service that only one of them offers', () => {
    const only = step({ serviceId: 'jeugd' });
    expect(only.hasStep).toBe(false);
    expect(only.open).toBe(false);
    expect(only.candidates).toEqual([rutger]);
    expect(only.providerId).toBe('rutger');
  });

  it('"Iedereen" means no provider while several can take the service', () => {
    const anyone = step({ serviceId: 'volwassene', choice: null });
    expect(anyone.hasStep).toBe(true);
    expect(anyone.open).toBe(false);
    expect(anyone.picked).toBeNull();
    expect(anyone.providerId).toBeNull();
  });

  it('a chosen provider is the one the moments and the booking are for', () => {
    const chosen = step({ serviceId: 'volwassene', choice: 'sam' });
    expect(chosen.open).toBe(false);
    expect(chosen.picked).toBe(sam);
    expect(chosen.providerId).toBe('sam');
    expect(step({ choice: 'sam' }).picked).toBe(sam);
  });

  it('keeps the step once it was answered, also for a service one provider offers', () => {
    const kept = step({ serviceId: 'jeugd', choice: null });
    expect(kept.hasStep).toBe(true);
    expect(kept.open).toBe(false);
    // "Iedereen" with a single candidate is that candidate.
    expect(kept.providerId).toBe('rutger');
  });

  it('"Wijzigen" reopens the step even for a service one provider offers', () => {
    const again = step({ serviceId: 'jeugd', reopened: true });
    expect(again.hasStep).toBe(true);
    expect(again.open).toBe(true);
    expect(again.candidates).toEqual([rutger]);
  });

  it('ignores a chosen provider that is not in the list', () => {
    const stale = step({ serviceId: 'volwassene', choice: 'weg' });
    expect(stale.picked).toBeNull();
    expect(stale.providerId).toBeNull();
    expect(stale.open).toBe(false);
  });
});

describe('Bij wie? switched off', () => {
  it('never shows the step; several providers mean "Iedereen"', () => {
    const off = step({ showChoice: false, serviceId: 'volwassene' });
    expect(off.hasStep).toBe(false);
    expect(off.open).toBe(false);
    expect(off.providerId).toBeNull();
  });

  it('still books the only provider who offers the service', () => {
    expect(step({ showChoice: false, serviceId: 'jeugd' }).providerId).toBe('rutger');
  });
});

describe('without providers', () => {
  it('has no step and nobody to book', () => {
    const none = step({ providers: [], serviceId: 'volwassene' });
    expect(none.hasStep).toBe(false);
    expect(none.providerId).toBeNull();
    expect(none.candidates).toEqual([]);
  });
});

describe('the done-state line', () => {
  it('says "Iedereen", the provider by name, or nothing', () => {
    expect(providerSummary(null, BOTH)).toBe('Iedereen');
    expect(providerSummary('sam', BOTH)).toBe('Sam');
    expect(providerSummary(undefined, BOTH)).toBe('');
    expect(providerSummary('weg', BOTH)).toBe('');
  });
});
