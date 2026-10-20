import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import {
  AANBOD_PRICES_DATE,
  NEW_OFFERING_SLUGS,
  OFFERING_PRICE_CHANGES,
  SERVICE_PRICE_CHANGES,
} from './aanbod-prices';
import { DEFAULT_OFFERS, PRICES } from './defaults';

describe('aanbod prices of 20 Oct 2026 (what the patch changes)', () => {
  it('covers every default offering exactly once: seven changed, two new', () => {
    const changed = OFFERING_PRICE_CHANGES.map((change) => change.slug);
    const all = [...changed, ...NEW_OFFERING_SLUGS].sort();
    expect(all).toEqual(DEFAULT_OFFERS.map((entry) => entry.content.slug).sort());
    expect(new Set(all).size).toBe(all.length);
    expect(AANBOD_PRICES_DATE).toBe('2026-10-20');
  });

  it('targets the defaults themselves and always changes something', () => {
    for (const change of OFFERING_PRICE_CHANGES) {
      const offering = DEFAULT_OFFERS.find((entry) => entry.content.slug === change.slug)!;
      expect(change.to.duration).toBe(offering.content.duration);
      expect(change.to.contents).toEqual(offering.content.contents);
      expect(change.to.extras).toEqual(offering.content.extras);
      expect(change.to.variantMode).toBe(offering.variantMode);
      expect(change.to.variants).toEqual(
        offering.variants.map((v) => ({ audience: v.audience, priceCents: v.priceCents })),
      );
      expect(JSON.stringify(change.from)).not.toBe(JSON.stringify(change.to));
      // The old state never carried a price; every new state does.
      expect(change.from.variants.every((variant) => variant.priceCents === null)).toBe(true);
      expect(change.to.variants.every((variant) => variant.priceCents !== null)).toBe(true);
    }
  });

  it('prices the fits as Toshoni gave them, in the offer and in the widget', () => {
    const current = OFFERING_PRICE_CHANGES.find((c) => c.slug === 'bikefit-huidige-fiets')!;
    expect(current.to.variants).toEqual([
      { audience: 'adult', priceCents: PRICES.bikefit },
      { audience: 'youth', priceCents: PRICES.bikefitUnder16 },
    ]);
    expect(SERVICE_PRICE_CHANGES.map((change) => change.slug)).toEqual([
      'volwassenenfit',
      'jeugdfit',
    ]);
    for (const change of SERVICE_PRICE_CHANGES) {
      const service = DEFAULT_SERVICES.find((entry) => entry.slug === change.slug)!;
      expect(change.to).toEqual({
        durationMinutes: service.durationMinutes,
        priceCents: service.priceCents,
        showPrice: service.showPrice,
      });
      expect(change.to.durationMinutes).toBe(120);
      expect(change.to.showPrice).toBe(true);
      expect(change.from.showPrice).toBe(false);
    }
    expect(PRICES).toEqual({
      bikefit: 27500,
      bikefitUnder16: 15000,
      secondVisit: 7500,
      secondBikeSameType: 7500,
      secondBikeOtherType: 15000,
      saddle: 6000,
      foot: 8500,
      cleats: 1500,
      lactate: 12000,
      coaching: 6500,
    });
  });
});
