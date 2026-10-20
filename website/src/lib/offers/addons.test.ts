import { describe, expect, it } from 'vitest';
import { formatPrice } from '@/lib/booking/format';
import {
  addonMetaLabel,
  addonOptionsFor,
  addonPriceFor,
  addonTotals,
  pickAddons,
  totalsLabel,
  type AddonSource,
} from './addons';

function source(partial: Partial<AddonSource> & { id: string }): AddonSource {
  return {
    content: { slug: partial.id, title: partial.id },
    settings: {
      isListed: true,
      isAddon: true,
      addonMinutes: 30,
      variants: [{ audience: 'all', serviceId: null, priceCents: 8500 }],
    },
    ...partial,
  };
}

const foot = source({ id: 'voet', content: { slug: 'voetanalyse', title: 'Voetanalyse' } });
const saddle = source({
  id: 'zadel',
  content: { slug: 'zadelanalyse', title: 'Zadelanalyse' },
  settings: {
    isListed: true,
    isAddon: true,
    addonMinutes: 60,
    variants: [{ audience: 'all', serviceId: null, priceCents: 6000 }],
  },
});
const perAudience = source({
  id: 'tweede',
  settings: {
    isListed: true,
    isAddon: true,
    addonMinutes: 45,
    variants: [
      { audience: 'adult', serviceId: null, priceCents: 7500 },
      { audience: 'youth', serviceId: null, priceCents: null },
    ],
  },
});
const host = { id: 'bikefit', settings: { addonIds: ['tweede', 'voet', 'zadel'] } };

describe('addonPriceFor', () => {
  it('takes the audience variant, else the single option, else the first priced one', () => {
    expect(addonPriceFor(perAudience, 'adult')).toBe(7500);
    // Jeugd has no price of its own and there is no single option: the first priced variant.
    expect(addonPriceFor(perAudience, 'youth')).toBe(7500);
    expect(addonPriceFor(foot, 'youth')).toBe(8500);
    expect(
      addonPriceFor(
        source({
          id: 'x',
          settings: {
            isListed: true,
            isAddon: true,
            addonMinutes: 10,
            variants: [{ audience: 'all', serviceId: null, priceCents: null }],
          },
        }),
        'all',
      ),
    ).toBeNull();
  });
});

describe('addonOptionsFor', () => {
  it("lists the host's extras in the host's order, priced for the audience, labelled", () => {
    const options = addonOptionsFor(host, 'adult', [foot, saddle, perAudience]);
    expect(options.map((option) => option.slug)).toEqual(['tweede', 'voetanalyse', 'zadelanalyse']);
    expect(options[0]).toEqual({
      offeringId: 'tweede',
      slug: 'tweede',
      title: 'tweede',
      minutes: 45,
      priceCents: 7500,
      priceLabel: formatPrice(7500),
    });
  });

  it('leaves out what cannot be booked as an extra: hidden, not an extra, no minutes, no price, itself, unknown, twice', () => {
    const hidden = source({ id: 'hidden', settings: { ...foot.settings, isListed: false } });
    const plain = source({ id: 'plain', settings: { ...foot.settings, isAddon: false } });
    const noMinutes = source({ id: 'nomin', settings: { ...foot.settings, addonMinutes: null } });
    const noPrice = source({
      id: 'noprice',
      settings: {
        ...foot.settings,
        variants: [{ audience: 'all', serviceId: null, priceCents: null }],
      },
    });
    const options = addonOptionsFor(
      {
        id: 'self',
        settings: {
          addonIds: ['hidden', 'plain', 'nomin', 'noprice', 'self', 'missing', 'voet', 'voet'],
        },
      },
      'all',
      [hidden, plain, noMinutes, noPrice, foot, source({ id: 'self' })],
    );
    expect(options.map((option) => option.offeringId)).toEqual(['voet']);
  });
});

describe('addonTotals and labels', () => {
  const options = addonOptionsFor(host, 'adult', [foot, saddle, perAudience]);

  it('adds minutes and cents to the base; the total price stays unknown without a base price', () => {
    expect(addonTotals({ durationMinutes: 120, priceCents: 27500 }, options)).toEqual({
      minutes: 255,
      priceCents: 27500 + 7500 + 8500 + 6000,
      extraMinutes: 135,
      extraCents: 22000,
    });
    expect(addonTotals({ durationMinutes: 120, priceCents: null }, [])).toEqual({
      minutes: 120,
      priceCents: null,
      extraMinutes: 0,
      extraCents: 0,
    });
  });

  it('writes the meta and totals the way the widget shows them', () => {
    expect(addonMetaLabel({ minutes: 30, priceCents: 8500 })).toBe(
      `+ 30 min · + ${formatPrice(8500)}`,
    );
    expect(totalsLabel({ minutes: 150, priceCents: 36000 })).toBe(
      `Samen 2 u 30 min · ${formatPrice(36000)}`,
    );
    expect(totalsLabel({ minutes: 150, priceCents: null })).toBe('Samen 2 u 30 min');
  });
});

describe('pickAddons', () => {
  const options = addonOptionsFor(host, 'adult', [foot, saddle, perAudience]);

  it('keeps option order, de-duplicates, and refuses an id that is not an option', () => {
    const picked = pickAddons(options, ['zadel', 'voet', 'voet']);
    expect(picked.ok).toBe(true);
    if (picked.ok) expect(picked.addons.map((a) => a.offeringId)).toEqual(['voet', 'zadel']);
    expect(pickAddons(options, ['voet', 'lactaat'])).toEqual({ ok: false, unknown: ['lactaat'] });
    expect(pickAddons(options, [])).toEqual({ ok: true, addons: [] });
  });
});
