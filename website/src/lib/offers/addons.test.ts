import { describe, expect, it } from 'vitest';
import { formatPrice } from '@/lib/booking/format';
import {
  addonChoiceId,
  addonChoicesDurationLabel,
  addonChoicesPriceLabel,
  addonMetaLabel,
  addonOptionsFor,
  addonPriceFor,
  addonProseLabel,
  addonTotals,
  pickAddons,
  preselectAddonIds,
  toggleAddonId,
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
      addonOptions: [],
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
    addonOptions: [],
    variants: [{ audience: 'all', serviceId: null, priceCents: 6000 }],
  },
});
const perAudience = source({
  id: 'tweede-bezoek',
  settings: {
    isListed: true,
    isAddon: true,
    addonMinutes: 45,
    addonOptions: [],
    variants: [
      { audience: 'adult', serviceId: null, priceCents: 7500 },
      { audience: 'youth', serviceId: null, priceCents: null },
    ],
  },
});
/** An extra with two choices (Bikefit – tweede fiets). */
const secondBike = source({
  id: 'tweede',
  content: { slug: 'bikefit-tweede-fiets', title: 'Bikefit – tweede fiets' },
  settings: {
    isListed: true,
    isAddon: true,
    addonMinutes: 30,
    addonOptions: [
      { key: 'zelfde-type', label: 'Zelfde type fiets', minutes: 30, priceCents: 7500 },
      { key: 'ander-type', label: 'Ander type fiets', minutes: 60, priceCents: 15000 },
    ],
    variants: [{ audience: 'all', serviceId: null, priceCents: 7500 }],
  },
});
const host = {
  id: 'bikefit',
  settings: { addonIds: ['tweede', 'tweede-bezoek', 'voet', 'zadel'] },
};
const SOURCES = [foot, saddle, perAudience, secondBike];

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
            addonOptions: [],
            variants: [{ audience: 'all', serviceId: null, priceCents: null }],
          },
        }),
        'all',
      ),
    ).toBeNull();
  });
});

describe('addonOptionsFor', () => {
  it("lists the host's extras in the host's order; an extra with choices gives one option per choice", () => {
    const options = addonOptionsFor(host, 'adult', SOURCES);
    expect(options.map((option) => option.id)).toEqual([
      addonChoiceId('tweede', 'zelfde-type'),
      addonChoiceId('tweede', 'ander-type'),
      'tweede-bezoek',
      'voet',
      'zadel',
    ]);
    expect(options[1]).toEqual({
      id: 'tweede#ander-type',
      offeringId: 'tweede',
      optionKey: 'ander-type',
      slug: 'bikefit-tweede-fiets',
      title: 'Bikefit – tweede fiets – Ander type fiets',
      groupTitle: 'Bikefit – tweede fiets',
      label: 'Ander type fiets',
      minutes: 60,
      priceCents: 15000,
      priceLabel: formatPrice(15000),
    });
    expect(options[2]).toEqual({
      id: 'tweede-bezoek',
      offeringId: 'tweede-bezoek',
      optionKey: null,
      slug: 'tweede-bezoek',
      title: 'tweede-bezoek',
      groupTitle: null,
      label: 'tweede-bezoek',
      minutes: 45,
      priceCents: 7500,
      priceLabel: formatPrice(7500),
    });
  });

  it('prices an option for the audience of the variant it is added to', () => {
    const youthPriced = source({
      id: 'jeugd-extra',
      settings: {
        ...perAudience.settings,
        variants: [
          { audience: 'adult', serviceId: null, priceCents: 7500 },
          { audience: 'youth', serviceId: null, priceCents: 6500 },
        ],
      },
    });
    const prices = (audience: 'adult' | 'youth') =>
      addonOptionsFor({ id: 'h', settings: { addonIds: ['jeugd-extra'] } }, audience, [
        youthPriced,
      ]).map((option) => option.priceCents);
    expect([prices('adult'), prices('youth')]).toEqual([[7500], [6500]]);
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

  it('writes the meta, the totals and the choice lines the way the site shows them', () => {
    expect(addonMetaLabel({ minutes: 30, priceCents: 8500 })).toBe(
      `+ 30 min · + ${formatPrice(8500)}`,
    );
    expect(totalsLabel({ minutes: 150, priceCents: 36000 })).toBe(
      `Samen 2 u 30 min · ${formatPrice(36000)}`,
    );
    expect(totalsLabel({ minutes: 150, priceCents: null })).toBe('Samen 2 u 30 min');
    expect(addonChoicesPriceLabel(secondBike.settings.addonOptions)).toBe(
      `Zelfde type fiets ${formatPrice(7500)} · Ander type fiets ${formatPrice(15000)}`,
    );
    expect(addonChoicesDurationLabel(secondBike.settings.addonOptions)).toBe(
      'Zelfde type fiets: 30 min · Ander type fiets: 1 uur',
    );
  });

  it('writes an extra for a sentence: price, then time, no label and no total', () => {
    const plain = (value: string) => value.replace(/\s/g, ' ');
    expect(plain(addonProseLabel({ minutes: 30, priceCents: 7500 }))).toBe(
      '€ 75 en 30 minuten extra',
    );
    expect(plain(addonProseLabel({ minutes: 60, priceCents: 15000 }))).toBe('€ 150 en 1 uur extra');
    expect(plain(addonProseLabel({ minutes: 90, priceCents: 8550 }))).toBe(
      '€ 85,50 en 1 uur 30 minuten extra',
    );
  });
});

describe('pickAddons, toggleAddonId, preselectAddonIds', () => {
  const options = addonOptionsFor(host, 'adult', SOURCES);
  const same = addonChoiceId('tweede', 'zelfde-type');
  const other = addonChoiceId('tweede', 'ander-type');

  it('keeps option order, de-duplicates, refuses an unknown id and two choices of one extra', () => {
    const picked = pickAddons(options, ['zadel', 'voet', 'voet', other]);
    expect(picked.ok).toBe(true);
    if (picked.ok) expect(picked.addons.map((a) => a.id)).toEqual([other, 'voet', 'zadel']);
    expect(pickAddons(options, ['voet', 'lactaat'])).toEqual({
      ok: false,
      reason: 'unknown',
      ids: ['lactaat'],
    });
    expect(pickAddons(options, [same, other])).toEqual({
      ok: false,
      reason: 'twice',
      ids: ['tweede'],
    });
    expect(pickAddons(options, [])).toEqual({ ok: true, addons: [] });
  });

  it('a choice replaces its sibling; an unknown id changes nothing', () => {
    expect(toggleAddonId(options, [], same)).toEqual([same]);
    expect(toggleAddonId(options, [same, 'voet'], other)).toEqual(['voet', other]);
    expect(toggleAddonId(options, ['voet', other], other)).toEqual(['voet']);
    expect(toggleAddonId(options, ['voet'], 'nope')).toEqual(['voet']);
  });

  it('?extra= ticks the first choice of a named extra, once per extra', () => {
    expect(preselectAddonIds(options, ['bikefit-tweede-fiets', 'voetanalyse', 'x'])).toEqual([
      same,
      'voet',
    ]);
    expect(preselectAddonIds(options, [])).toEqual([]);
  });
});
