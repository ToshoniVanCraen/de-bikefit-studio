import { describe, expect, it } from 'vitest';
import {
  filterSlotsByLocation,
  locationAddressLines,
  locationsForService,
  normalizeLocationSelection,
  toggleLocation,
} from './location-choice';
import type {
  BookingLocationOption,
  BookingProviderOption,
  BookingServiceOption,
  BookingSlot,
} from './types';

const ninove: BookingLocationOption = {
  id: 'loc-ninove',
  kind: 'studio',
  label: 'De Bikefit Studio, Ninove',
  addressLines: ['Straat 1', '9400 Ninove'],
};
const asse: BookingLocationOption = {
  id: 'loc-asse',
  kind: 'studio',
  label: 'Asse',
  addressLines: ['Weversstraat 7', '1730 Asse'],
};
const home: BookingLocationOption = {
  id: 'loc-home',
  kind: 'customer',
  label: 'Bij jou thuis',
  addressLines: [],
};
const LOCATIONS = [ninove, asse, home];

function service(partial: Partial<BookingServiceOption> & { id: string }): BookingServiceOption {
  return {
    slug: partial.id,
    name: partial.id,
    choiceLabel: '',
    description: '',
    durationMinutes: 120,
    location: null,
    priceLabel: '',
    priceCents: null,
    addons: [],
    ...partial,
  };
}

function provider(
  partial: Partial<BookingProviderOption> & { id: string; serviceIds: string[] },
): BookingProviderOption {
  return {
    name: partial.id,
    services: partial.serviceIds.map((serviceId) => ({ serviceId, location: ninove })),
    locations: [],
    ...partial,
  };
}

const fit = service({ id: 'fit' });
const atHome = service({ id: 'thuis', location: home });

describe('locationsForService', () => {
  it('a pinned service is at its place; an unpinned one at the places its providers work', () => {
    const rutger = provider({
      id: 'rutger',
      serviceIds: ['fit', 'thuis'],
      locations: [ninove, asse],
    });
    const guest = provider({ id: 'guest', serviceIds: ['fit'] });
    const providers = [rutger, guest];
    expect(
      locationsForService({ service: fit, providers, providerId: null, locations: LOCATIONS }),
    ).toEqual([ninove, asse]);
    expect(
      locationsForService({ service: atHome, providers, providerId: null, locations: LOCATIONS }),
    ).toEqual([home]);
    // A chosen provider narrows the places to theirs; one without hours rows falls back to the resolved place.
    expect(
      locationsForService({ service: fit, providers, providerId: 'guest', locations: LOCATIONS }),
    ).toEqual([ninove]);
    expect(
      locationsForService({ service: null, providers, providerId: null, locations: LOCATIONS }),
    ).toEqual([]);
  });
});

describe('the selection', () => {
  const offered = [ninove, asse];

  it('normalises: unknown ids go, empty or complete means every place', () => {
    expect(normalizeLocationSelection(null, offered)).toBeNull();
    expect(normalizeLocationSelection(['loc-ninove', 'loc-home'], offered)).toEqual(['loc-ninove']);
    expect(normalizeLocationSelection(['loc-ninove', 'loc-asse'], offered)).toBeNull();
    expect(normalizeLocationSelection(['loc-home'], offered)).toBeNull();
  });

  it('toggles: from every place to one, in and out, back to every place', () => {
    const one = toggleLocation(null, 'loc-asse', offered);
    expect(one).toEqual(['loc-asse']);
    expect(toggleLocation(one, 'loc-ninove', offered)).toBeNull();
    expect(toggleLocation(one, 'loc-asse', offered)).toBeNull();
  });

  it('filters the slots to the selected places; a slot without a place only shows under every place', () => {
    const slots: BookingSlot[] = [
      {
        startsAt: '2026-11-02T08:00:00.000Z',
        endsAt: '',
        providerId: 'r',
        locationId: 'loc-ninove',
      },
      { startsAt: '2026-11-02T09:00:00.000Z', endsAt: '', providerId: 'r', locationId: 'loc-asse' },
      { startsAt: '2026-11-02T10:00:00.000Z', endsAt: '', providerId: 'r', locationId: null },
    ];
    expect(filterSlotsByLocation(slots, null)).toHaveLength(3);
    expect(filterSlotsByLocation(slots, ['loc-asse']).map((slot) => slot.locationId)).toEqual([
      'loc-asse',
    ]);
  });

  it('shows a studio address, and for a fit at home how the address is asked', () => {
    expect(locationAddressLines(ninove)).toEqual(['Straat 1', '9400 Ninove']);
    expect(locationAddressLines(home)).toEqual(['Je adres vul je straks in bij je gegevens.']);
  });
});
