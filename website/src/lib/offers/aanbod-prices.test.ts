import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICES } from '@/lib/booking/defaults';
import {
  AANBOD_PRICES_DATE,
  COPY_OF_20_OCT,
  NEW_OFFERING_SLUGS,
  OFFERING_PRICE_CHANGES,
  SERVICE_PRICE_CHANGES,
} from './aanbod-prices';
import { OFFERING_TEXT_CORRECTIONS } from './corrections-2026-10-27';
import { DEFAULT_OFFERS, PRICES } from './defaults';

/** The two fits whose defaults moved on on 27 Oct 2026; the patch keeps the 20 Oct values. */
const FITS = ['bikefit-nieuwe-fiets', 'bikefit-huidige-fiets'];
const targetOf = (slug: string) => OFFERING_PRICE_CHANGES.find((entry) => entry.slug === slug)!.to;

describe('aanbod prices of 20 Oct 2026 (what the patch changes)', () => {
  it('covers every default offering exactly once: seven changed, two new', () => {
    const changed = OFFERING_PRICE_CHANGES.map((change) => change.slug);
    const all = [...changed, ...NEW_OFFERING_SLUGS].sort();
    expect(all).toEqual(DEFAULT_OFFERS.map((entry) => entry.content.slug).sort());
    expect(new Set(all).size).toBe(all.length);
    expect(AANBOD_PRICES_DATE).toBe('2026-10-20');
  });

  it('targets the defaults themselves (the fits and the frozen copy excepted) and always changes something', () => {
    for (const change of OFFERING_PRICE_CHANGES) {
      const offering = DEFAULT_OFFERS.find((entry) => entry.content.slug === change.slug)!;
      const frozen = COPY_OF_20_OCT[change.slug] ?? {};
      // The Duur of "aankoop nieuwe fiets" is `{{duur:volwassenenfit}}` since 27 Oct 2026; the patch of
      // 20 Oct wrote "2 uur" (frozen with the rest of that fit).
      if (change.slug === 'bikefit-nieuwe-fiets') expect(change.to.duration).toBe('2 uur');
      else expect(change.to.duration).toBe(offering.content.duration);
      expect(change.to.variantMode).toBe(offering.variantMode);
      if (!FITS.includes(change.slug)) {
        if (!frozen.contents) expect(change.to.contents).toEqual(offering.content.contents);
        if (!frozen.extras) expect(change.to.extras).toEqual(offering.content.extras);
        if (!frozen.metaDescription) {
          expect(change.to.metaDescription).toBe(offering.content.metaDescription);
        }
        expect(change.to.variants).toEqual(
          offering.variants.map((v) => ({ audience: v.audience, priceCents: v.priceCents })),
        );
      }
      expect(JSON.stringify(change.from)).not.toBe(JSON.stringify(change.to));
      // The old state never carried a price; every new state does.
      expect(change.from.variants.every((variant) => variant.priceCents === null)).toBe(true);
      expect(change.to.variants.every((variant) => variant.priceCents !== null)).toBe(true);
    }
  });

  it('keeps the two fits at what the patch of 20 Oct 2026 wrote: the defaults of 27 Oct moved on', () => {
    // A re-run on a database that has the 20 Oct values must still say "already at the 20 Oct 2026 values".
    for (const slug of FITS) {
      const to = targetOf(slug);
      const defaults = DEFAULT_OFFERS.find((entry) => entry.content.slug === slug)!;
      expect(to.variants).toEqual([
        { audience: 'adult', priceCents: 27500 },
        { audience: 'youth', priceCents: 15000 },
      ]);
      expect(defaults.variants.map((variant) => variant.audience)).toEqual(['adult', 'youth']);
      expect(to.contents.at(-1)).toBe(
        'Probleemopvolging tot zes maanden na je fit is inbegrepen. Onder 16: € 150 zonder opvolging, € 275 met.',
      );
      expect(to.metaDescription).toMatch(/ € 275, onder 16 € 150\.$/);
      expect(to.contents).not.toEqual(defaults.content.contents);
      expect(to.metaDescription).not.toBe(defaults.content.metaDescription);
    }
    expect(targetOf('bikefit-nieuwe-fiets')).toMatchObject({
      contents: expect.arrayContaining([
        'Zadelanalyse, voetanalyse en het afstellen van je schoenplaatjes zitten erin.',
      ]),
      extras: [
        'Afstelling van je nieuwe fiets na de aankoop.',
        'Een tweede bezoek na meer dan zes maanden: € 75.',
        'Een tweede fiets erbij: vanaf € 75.',
      ],
    });
    expect(targetOf('bikefit-nieuwe-fiets').contents).toHaveLength(5);
    expect(targetOf('bikefit-huidige-fiets').contents).toHaveLength(6);
    expect(targetOf('bikefit-huidige-fiets').extras).toEqual([
      'Een tweede bezoek na meer dan zes maanden: € 75.',
      'Een tweede fiets erbij: vanaf € 75.',
      'Nieuwe onderdelen, altijd apart en vooraf besproken.',
    ]);
  });

  it('keeps the copy the corrections of 27 Oct moved on at what the patch of 20 Oct wrote', () => {
    // The corrections name, per offering, the text a 20 Oct database holds (`from`). That is the
    // target of this patch, however the defaults say it now.
    const compared = ['duration', 'contents', 'extras', 'metaDescription'] as const;
    for (const correction of OFFERING_TEXT_CORRECTIONS) {
      const change = OFFERING_PRICE_CHANGES.find((entry) => entry.slug === correction.slug);
      if (!change) continue; // the two offerings that are new on 20 Oct have no target here
      for (const key of compared) {
        const before = correction.from[key];
        if (before !== undefined) {
          expect(change.to[key], `${correction.slug}.${key}`).toEqual(before);
        }
      }
    }
    // What is frozen is exactly what a correction names, and nothing else.
    for (const [slug, frozen] of Object.entries(COPY_OF_20_OCT)) {
      const correction = OFFERING_TEXT_CORRECTIONS.find((entry) => entry.slug === slug);
      expect(correction, slug).toBeDefined();
      for (const key of Object.keys(frozen) as Array<keyof typeof frozen>) {
        expect(correction?.from[key], `${slug}.${key}`).toEqual(frozen[key]);
      }
    }
    expect(Object.keys(COPY_OF_20_OCT).sort()).toEqual([
      'afstellen-schoenplaatjes',
      'coaching',
      'lactaattest',
      'voetanalyse',
      'zadelanalyse',
    ]);
    expect(targetOf('lactaattest').metaDescription).toMatch(
      /^Lactaattest voor fietsers: .* € 120\.$/,
    );
    expect(targetOf('coaching').extras[0]).toBe('Een lactaattest.');
  });

  it('prices the fits as Toshoni gave them, in the offer and in the widget', () => {
    expect(targetOf('bikefit-huidige-fiets').variants).toEqual([
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
